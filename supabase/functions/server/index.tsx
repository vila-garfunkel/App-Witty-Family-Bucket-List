import { Hono, type Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import { bodyLimit } from "npm:hono/body-limit";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { applyAction, emptyStore, ensureProfile, removeAccountData, RequestError, workspace, type Store } from "./domain.ts";
import { applyChatAction, getThread, listThreads, startPrivate, upgradeChat } from "./chat.ts";
import { text } from "./rules.ts";

type Env = { Variables: { userId: string; email: string; displayName: string; metadata: Record<string, unknown> } };
const app = new Hono<Env>();
const prefix = "/make-server-a728503c";
const table = "kv_store_a728503c";
const key = "familybucket:workspace:v1";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "OPTIONS"] }));
app.use("/*", bodyLimit({ maxSize: 16 * 1024, onError: c => c.json({ error: "That request is a little too big for the bucket." }, 413) }));
app.get(`${prefix}/health`, c => c.json({ status: "ok", apiVersion: 2, features: ["private-messages", "family-chat"] }));

app.use(`${prefix}/*`, async (c, next) => {
  const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return c.json({ error: "Please log in to open your bucket." }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return c.json({ error: "Your session has wandered off. Please log in again." }, 401);
  c.set("userId", data.user.id);
  c.set("email", data.user.email ?? "");
  c.set("metadata", data.user.user_metadata);
  const name = data.user.user_metadata.display_name ?? data.user.user_metadata.full_name ?? data.user.user_metadata.name;
  c.set("displayName", typeof name === "string" ? name.trim().slice(0, 40) : "");
  await next();
});

async function load(): Promise<Store | null> {
  const { data, error } = await admin.from(table).select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function mutate<T>(fn: (store: Store) => T): Promise<{ result: T; store: Store }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await load();
    const store: Store = current ? structuredClone(current) : emptyStore();
    upgradeChat(store, Date.now());
    const result = fn(store);
    store.revision++;
    // A revision guard makes membership, the creator limit, and wish edits atomic
    // across concurrent requests and separate edge-function instances.
    const query = current
      ? admin.from(table).update({ value: store }).eq("key", key).eq("value->>revision", String(current.revision)).select("key")
      : admin.from(table).insert({ key, value: store }).select("key");
    const { data, error } = await query;
    if (error) {
      if (!current && error.code === "23505") continue;
      throw error;
    }
    if (data?.length) return { result, store };
  }
  throw new RequestError("The family’s busy dreaming. Please try again.", 409);
}

function syncProfile(s: Store, id: string, email: string, displayName: string) {
  const p = ensureProfile(s, id);
  if (p.deleting) throw new RequestError("Your account is unavailable. Please sign in again.", 403);
  p.email = email.toLowerCase();
  p.displayName = displayName;
  p.alias = displayName || email || "Memory maker";
  p.authSynced = true;
}

async function snapshot(c: Context<Env>) {
  const id = c.get("userId");
  let store = await load();
  let displayName = c.get("displayName");
  const previous = store?.profiles[id];
  // Preserve deliberately edited names from the original app once, then Auth
  // metadata is the source of truth for all future profile changes.
  if (previous && !previous.authSynced && !displayName && previous.alias && previous.alias !== "Memory maker") {
    displayName = previous.alias;
    const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: { ...c.get("metadata"), display_name: displayName } });
    if (error) throw new RequestError("We couldn’t sync your display name. Please try again.", 503);
    c.set("displayName", displayName);
  }
  if (!previous || store?.schemaVersion !== 2 || !previous.authSynced || previous.email !== c.get("email").toLowerCase() || previous.displayName !== displayName) {
    ({ store } = await mutate(s => syncProfile(s, id, c.get("email"), displayName)));
  }
  return store!;
}

app.get(`${prefix}/workspace`, async c => {
  return c.json(workspace(await snapshot(c), c.get("userId")));
});

app.post(`${prefix}/action`, async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Please send a valid action.");
  const id = c.get("userId");
  await snapshot(c);
  if (body.type === "profile.alias") {
    const name = text(body.alias, 40, "Your display name", true);
    const { error } = await admin.auth.admin.updateUserById(id, { user_metadata: { ...c.get("metadata"), display_name: name, full_name: name } });
    if (error) throw new RequestError("We couldn’t save your Auth display name. Please try again.", 503);
  }
  const entropy = { id: crypto.randomUUID(), code: crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase() };
  const { result, store } = await mutate(s => applyAction(s, id, body, { ...entropy, now: Date.now() }));
  if (result.error) return c.json({ error: result.error }, 400);
  return c.json(workspace(store, id));
});

app.get(`${prefix}/messages`, async c => {
  const store = await snapshot(c);
  const now = Date.now();
  return c.json({ threads: listThreads(store, c.get("userId"), now), serverNow: now });
});
app.get(`${prefix}/messages/:id`, async c => {
  const store = await snapshot(c);
  return c.json(getThread(store, c.req.param("id"), c.get("userId"), Date.now()));
});
app.post(`${prefix}/messages/start`, async c => {
  const body = await c.req.json().catch(() => null);
  const email = text(body?.email, 254, "The recipient email").toLowerCase();
  const message = text(body?.body, 2000, "Your message");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("That email needs a little finishing touch.");
  const initial = await snapshot(c);
  const id = c.get("userId");
  const { result: allowed } = await mutate(s => {
    const p = ensureProfile(s, id);
    p.composeAttempts = (p.composeAttempts ?? []).filter(t => t > Date.now() - 600000);
    if (p.composeAttempts.length >= 8) return false;
    p.composeAttempts.push(Date.now());
    return true;
  });
  if (!allowed) throw new RequestError("Your social butterfly needs a breather. Try composing again in ten minutes.", 429);
  let targetId = Object.values(initial.profiles).find(p => p.email === email && !p.deleting)?.id;
  let targetName = targetId ? initial.profiles[targetId].displayName ?? "" : "";
  if (targetId) {
    const { data, error } = await admin.auth.admin.getUserById(targetId);
    if (error || !data.user || data.user.email?.toLowerCase() !== email) targetId = undefined;
    else {
      const name = data.user.user_metadata.display_name ?? data.user.user_metadata.full_name ?? data.user.user_metadata.name;
      targetName = typeof name === "string" ? name.trim().slice(0, 40) : "";
    }
  }
  if (!targetId) {
    // Email is an explicit destination, not a browsable directory.
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new RequestError("We couldn’t open that chat. Try again in a moment.", 503);
      const target = data.users.find(u => u.email?.toLowerCase() === email);
      if (target) {
        targetId = target.id;
        const name = target.user_metadata.display_name ?? target.user_metadata.full_name ?? target.user_metadata.name;
        targetName = typeof name === "string" ? name.trim().slice(0, 40) : "";
        break;
      }
      if (data.users.length < 1000) break;
    }
  }
  if (!targetId) throw new RequestError("We couldn’t start that chat. Check the email or ask them to create an account first.");
  const recipientId = targetId;
  const messageId = crypto.randomUUID();
  const { result: threadId, store } = await mutate(s => {
    if (s.profiles[recipientId]?.deleting) throw new RequestError("We couldn’t start that chat.");
    const previous = s.profiles[recipientId];
    if (previous && !previous.authSynced && !targetName && previous.alias && previous.alias !== "Memory maker") {
      // Let the recipient's next authenticated snapshot migrate their original
      // edited name into Auth; receiving a first message must not erase it.
      previous.email = email;
      previous.displayName = previous.alias;
    } else syncProfile(s, recipientId, email, targetName);
    return startPrivate(s, id, recipientId, message, Date.now(), messageId);
  });
  return c.json(getThread(store, threadId, id, Date.now()));
});
app.post(`${prefix}/messages/action`, async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || !["message.send", "message.edit", "family.chat-alias", "family.rejoin"].includes(body.type)) throw new RequestError("Choose a valid chat action.");
  await snapshot(c);
  const id = c.get("userId");
  const eventId = crypto.randomUUID();
  const { store } = await mutate(s => { applyChatAction(s, id, body, { id: eventId, now: Date.now() }) });
  return c.json(getThread(store, String(body.threadId), id, Date.now()));
});

app.post(`${prefix}/delete-account`, async c => {
  const body = await c.req.json().catch(() => null);
  if (body?.confirmation !== "DELETE" || typeof body?.password !== "string") throw new RequestError("Confirm deletion and enter your password.");
  const verifier = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email: c.get("email"), password: body.password });
  if (verifyError || verified.user?.id !== c.get("userId")) throw new RequestError("That password didn’t match. Your account is still here.", 403);
  if (verified.session) await verifier.auth.signOut({ scope: "local" });
  const id = c.get("userId");
  await mutate(s => { const p = ensureProfile(s, id); p.deleting = true });
  // Remove app data first. If Auth deletion fails, the user can retry without
  // leaving personal wishes behind after their identity has been deleted.
  const { result: previousProfile } = await mutate(s => {
    const previous = { ...s.profiles[id] };
    removeAccountData(s, id);
    const tombstone = ensureProfile(s, id);
    tombstone.alias = "Deleted account";
    tombstone.hasCreatedGroup = previous.hasCreatedGroup;
    tombstone.onboarded = true;
    tombstone.deleting = true;
    return previous;
  });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    await mutate(s => {
      if (s.profiles[id]) {
        s.profiles[id].deleting = false;
        s.profiles[id].alias = previousProfile.alias;
      }
    });
    throw new RequestError("Your bucket data was removed, but account deletion couldn’t finish. Please retry.", 503);
  }
  // Keep a non-personal tombstone to block any in-flight, previously verified
  // request from recreating this account's data after Auth deletion.
  return c.json({ deleted: true });
});

app.onError((error, c) => {
  if (error instanceof RequestError) return c.json({ error: error.message }, error.status as 400);
  console.error("Family Bucket request failed", error instanceof Error ? error.name : "UnknownError");
  return c.json({ error: "A small bump in the road. Please try again in a moment." }, 500);
});
Deno.serve(app.fetch);

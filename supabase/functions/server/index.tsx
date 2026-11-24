import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { bodyLimit } from "npm:hono/body-limit";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { applyAction, emptyStore, ensureProfile, removeAccountData, RequestError, workspace, type Store } from "./domain.ts";

const app = new Hono<{ Variables: { userId: string; email: string } }>();
const prefix = "/make-server-a728503c";
const table = "kv_store_a728503c";
const key = "familybucket:workspace:v1";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
app.use("/*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "OPTIONS"] }));
app.use("/*", bodyLimit({ maxSize: 16 * 1024, onError: c => c.json({ error: "That request is a little too big for the bucket." }, 413) }));
app.get(`${prefix}/health`, c => c.json({ status: "ok" }));

app.use(`${prefix}/*`, async (c, next) => {
  const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return c.json({ error: "Please log in to open your bucket." }, 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return c.json({ error: "Your session has wandered off. Please log in again." }, 401);
  c.set("userId", data.user.id);
  c.set("email", data.user.email ?? "");
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

app.get(`${prefix}/workspace`, async c => {
  const id = c.get("userId");
  let store = await load();
  if (!store?.profiles[id]) ({ store } = await mutate(s => { ensureProfile(s, id) }));
  return c.json(workspace(store!, id));
});

app.post(`${prefix}/action`, async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Please send a valid action.");
  const id = c.get("userId");
  const entropy = { id: crypto.randomUUID(), code: crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(), now: Date.now() };
  const { result, store } = await mutate(s => applyAction(s, id, body, entropy));
  if (result.error) return c.json({ error: result.error }, 400);
  return c.json(workspace(store, id));
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

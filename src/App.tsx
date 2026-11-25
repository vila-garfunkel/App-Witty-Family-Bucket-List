import AuthGate from './AuthGate'
import FamilyWorkspace from './FamilyWorkspace'
import { BucketArt } from './ui'
import DownloadAppBanner from './DownloadAppBanner'

export default function App() {
  return <><DownloadAppBanner /><AuthGate illustration={<BucketArt />}>
    {(session, signOut, signingOut) => <FamilyWorkspace key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} onSignOut={signOut} signingOut={signingOut} />}
  </AuthGate></>
}

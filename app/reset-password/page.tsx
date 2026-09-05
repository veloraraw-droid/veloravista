import { Header } from "../components";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return <main className="login-page admin-login-page">
    <Header dark />
    <section className="login-card">
      <span>VELORA TEAM ACCESS</span>
      <h1>SET YOUR<br/><i>PASSWORD.</i></h1>
      <p>Choose a secure password for your Velora Vista Visuals account.</p>
      <ResetPasswordForm />
    </section>
    <div className="login-visual"><video autoPlay muted loop playsInline poster="/asset/showcase/still-03.jpg"><source src="/asset/showcase/motion-02.mp4" type="video/mp4"/></video><div><span>OWNER ACCESS</span><p>Secure control of<br/>the whole studio.</p></div></div>
  </main>;
}

import { mountAccount } from "./account.tsx";

const element = document.querySelector<HTMLElement>("#account-root");
if (element) {
  try { mountAccount(element); }
  catch {
    element.innerHTML = '<p class="account-error" role="alert">Sign-in could not load. Please reload to try again. You can still <a href="/map/">explore the public map</a>.</p>';
  }
}

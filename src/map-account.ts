import { mountAccount } from "./account.tsx";
import "./styles/account.css";

const nav = document.querySelector(".masthead");
if (nav) {
  const mount = document.createElement("div");
  mount.id = "map-account";
  mount.className = "map-account";
  nav.append(mount);
  mountAccount(mount);
}

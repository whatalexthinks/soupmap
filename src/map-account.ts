import { mountAccount } from "./account.tsx";
import "./styles/account.css";

const mount = document.querySelector<HTMLElement>("#map-account");
if (mount) void mountAccount(mount);

import { routes } from "@stricjs/app";
import wsRoute from "./index.ws";

export default routes("/watch").get("/", (c) => wsRoute.upgrade(c));

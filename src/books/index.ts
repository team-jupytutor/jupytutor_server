import { GlobalResource } from "./GlobalResource.js";
import { data8Resource } from "./Data8Resource.js";

const resources = new GlobalResource();
resources.register("data8", data8Resource);

export default resources;

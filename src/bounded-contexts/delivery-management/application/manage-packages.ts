import { ManageResources } from "@/kernel/application/manage-resources";
import type { DeliverablePackage } from "../domain/deliverable-package";
/** Coordinates packages through a replaceable repository port. */
export class ManageDeliverablePackages extends ManageResources<DeliverablePackage> {}

import { ManageDeliverablePackages } from "./application/manage-packages";
import { DeliverablePackageRepository } from "./infrastructure/http-repository";
export const packages = new ManageDeliverablePackages(
  new DeliverablePackageRepository(),
);

import console from "node:console";
import { optionChoser } from "@/utils/optionChoser.ts";
import { addInstance } from "@/operations/manage-instances/addInstance.ts";
import { listInstances } from "@/operations/manage-instances/listInstances.ts";
import { removeInstance } from "@/operations/manage-instances/removeInstance.ts";
import process from "node:process";

export async function manageInstances() {
  const options = [
    {
      name: "Add an instance",
      action: addInstance,
    },
    {
      name: "Remove an instance",
      action: removeInstance,
    },
    {
      name: "List instances",
      action: listInstances,
    },
    {
      name: "Exit",
      action: () => {
        console.log("Exiting");
        process.exit(0);
      },
    },
  ];

  const choice = await optionChoser(options.map((option) => option.name));
  options[choice]?.action();
}

import console from "node:console";
import process from "node:process";
import { optionChoser } from "@/utils/optionChoser.ts";
import { manageInstances } from "@/operations/manage-instances/index.ts";
import { transferData } from "@/operations/transfer/index.ts";

async function main(){
    console.log("Welcome to Strapi Sync!");
    console.log("This tool will help you sync your Strapi instances.");
    const options = [{
        name: "Manage saved instances",
        action: manageInstances
    }, {
        name: "Transfer data",
        action: transferData
    }, {
        name: "Exit",
        action: () => {
            console.log("Exiting");
            process.exit(0);
        }
    }];
    const choice = await optionChoser(options.map(option => option.name));
    options[choice]?.action();
}

main();
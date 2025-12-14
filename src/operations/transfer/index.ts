import { optionChoser } from "@/utils/optionChoser.ts";
import console from "node:console";
import process from "node:process";
import { totalTransfer } from "@/operations/transfer/total-transfer.ts";
import { componentTransfer } from "@/operations/transfer/component-transfer.ts";
import { documentTransfer } from "@/operations/transfer/document-transfer.ts";

export async function transferData(){
    console.log("Please select the transfer type:");
    const options = [
        {
            name: "Total transfer",
            action: totalTransfer,
        },
        {
            name: "Component transfer",
            action: componentTransfer,
        },
        {
            name: "Document transfer",
            action: documentTransfer,
        },
        {
            name: "Exit",
            action: () => {
                console.log("Exiting");
                process.exit(0);
            },
        },
    ];
    const choice = await optionChoser(options.map(option => option.name));
    options[choice]?.action();
}
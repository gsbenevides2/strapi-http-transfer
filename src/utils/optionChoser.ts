import console from "node:console";
import { makeQuestion } from "@/utils/makeQuestion.ts";

export function optionChoser(options: string[]): Promise<number> {
    return new Promise<number>((resolve) => {
        console.log("Please select an option:");
        for(const option of options){
            console.log(`${options.indexOf(option) + 1}. ${option}`);
        }
       makeQuestion("Enter your choice: ").then(async (choice) => {
        const choiceNumber = parseInt(choice);
        if(isNaN(choiceNumber)){
            console.log("Invalid choice");
            resolve(await optionChoser(options));
        }else {
            resolve(choiceNumber - 1);
        }
       });
    });
}
import readline from "node:readline";
import process from "node:process";

export function makeQuestion(question: string): Promise<string> {
    return new Promise<string>((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
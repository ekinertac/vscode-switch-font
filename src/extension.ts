import * as vscode from 'vscode';
import { exec } from 'child_process';

// Function to get a list of installed monospaced fonts based on the system
const getMonospacedFonts = (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let command = '';

        if (platform === 'win32') {
            command = 'reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" /s';
        } else if (platform === 'darwin' || platform === 'linux') {
            command = 'fc-list :spacing=mono --format="%{family[0]}\n" | sort | uniq';
        }

        exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const fonts = parseMonospacedFonts(stdout, platform);
            resolve(fonts);
        });
    });
};

// Function to parse the list of fonts based on the platform
const parseMonospacedFonts = (output: string, platform: string): string[] => {
    const fonts = new Set<string>();

    if (platform === 'win32') {
        const regex = /^\s*([^\s]+)\s+REG_SZ\s+(.*\.ttf)$/gm;
        let match;
        while ((match = regex.exec(output)) !== null) {
            if (match[1].toLowerCase().includes('mono')) {
                fonts.add(match[1]);
            }
        }
    } else if (platform === 'darwin' || platform === 'linux') {
        const lines = output.split('\n');
        for (const line of lines) {
            if (line && !line.startsWith('.')) { // Exclude unusable fonts starting with '.'
                fonts.add(line.trim());
            }
        }
    }

    return Array.from(fonts);
};

// VS Code command to list and select a monospaced font
export function activate(context: vscode.ExtensionContext) {
    let originalFont: string | undefined;

    let disposable = vscode.commands.registerCommand('extension.selectMonospacedFont', async () => {
        try {
            const fonts = await getMonospacedFonts();
            if (fonts.length === 0) {
                vscode.window.showErrorMessage('No monospaced fonts found on the system.');
                return;
            }

            const config = vscode.workspace.getConfiguration('editor');
            originalFont = config.get<string>('fontFamily');

            const quickPick = vscode.window.createQuickPick();
            quickPick.items = fonts.map(font => ({ label: font }));
            quickPick.placeholder = 'Select a monospaced font';

            quickPick.onDidChangeActive(items => {
                if (items[0]) {
                    const selectedFont = items[0].label;
                    const updatedFontFamily = [selectedFont, ...(originalFont ? originalFont.split(',').map(f => f.trim()) : [])]
                        .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
                        .join(', ');
                    config.update('fontFamily', updatedFontFamily, vscode.ConfigurationTarget.Global);
                }
            });

            quickPick.onDidAccept(async () => {
                const selectedFont = quickPick.selectedItems[0]?.label;
                if (selectedFont) {
                    const fontWeights = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
                    const weightQuickPick = vscode.window.createQuickPick();
                    weightQuickPick.items = fontWeights.map(weight => ({ label: weight }));
                    weightQuickPick.placeholder = `Select a font weight for ${selectedFont}`;

                    weightQuickPick.onDidAccept(() => {
                        const selectedWeight = weightQuickPick.selectedItems[0]?.label;
                        if (selectedWeight) {
                            config.update('fontWeight', selectedWeight, vscode.ConfigurationTarget.Global);
                        }
                        weightQuickPick.dispose();
                    });

                    weightQuickPick.onDidHide(() => {
                        weightQuickPick.dispose();
                    });

                    weightQuickPick.show();
                }
            });

            quickPick.onDidHide(() => {
                if (!quickPick.selectedItems.length && originalFont) {
                    config.update('fontFamily', originalFont, vscode.ConfigurationTarget.Global);
                }
                quickPick.dispose();
            });

            quickPick.show();
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching fonts: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

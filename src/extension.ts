import * as vscode from 'vscode';
import { exec } from 'child_process';

// Function to get a list of installed monospaced fonts on the system
const getMonospacedFonts = (): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let command = '';

        // Determine the command to list fonts based on the operating system
        if (platform === 'win32') {
            command = 'reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" /s';
        } else if (platform === 'darwin' || platform === 'linux') {
            command = 'fc-list :spacing=mono --format="%{family[0]}\n" | sort | uniq';
        }

        // Execute the command to get the list of fonts
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

// Function to parse the output and extract monospaced fonts
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

// Function to handle font selection using QuickPick
const handleFontSelection = async (fonts: string[], config: vscode.WorkspaceConfiguration, originalFont: string | undefined) => {
    const fontQuickPick = vscode.window.createQuickPick();

    // Add the current active font to the top of the list
    const firstFontinOriginalFont = originalFont?.split(',')[0].trim();
    if (firstFontinOriginalFont) {
        fonts.unshift(`Current Font: ${firstFontinOriginalFont}`);
    }

    fontQuickPick.items = fonts.map(font => ({ label: font }));
    fontQuickPick.placeholder = 'Select a monospaced font';

    let lastActiveFontIndex: number | undefined;

    // Restore last active font selection if available
    if (lastActiveFontIndex !== undefined) {
        fontQuickPick.activeItems = [fontQuickPick.items[lastActiveFontIndex]];
    }

    // Handle font selection change
    fontQuickPick.onDidChangeActive(items => {
        if (items[0]) {
            const selectedFont = items[0].label.replace('Current Font: ', '').trim();
            lastActiveFontIndex = fontQuickPick.items.findIndex(item => item.label === items[0].label);
            const updatedFontFamily = [selectedFont, ...(originalFont ? originalFont.split(',').map(f => f.trim()) : [])]
                .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
                .join(', ');
            config.update('fontFamily', updatedFontFamily, vscode.ConfigurationTarget.Global);
        }
    });

    // Handle font selection acceptance
    fontQuickPick.onDidAccept(() => {
        const selectedFont = fontQuickPick.selectedItems[0]?.label.replace('Current Font: ', '').trim();
        if (selectedFont) {
            handleWeightSelection(selectedFont, config, fontQuickPick);
        }
    });

    // Handle font selection hiding
    fontQuickPick.onDidHide(() => {
        if (!fontQuickPick.selectedItems.length && originalFont) {
            config.update('fontFamily', originalFont, vscode.ConfigurationTarget.Global);
        }
        fontQuickPick.dispose();
    });

    fontQuickPick.show();
};

// Function to handle weight selection using QuickPick
const handleWeightSelection = (selectedFont: string, config: vscode.WorkspaceConfiguration, fontQuickPick: vscode.QuickPick<vscode.QuickPickItem>) => {
    const weightQuickPick = vscode.window.createQuickPick();
    const fontWeights = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    weightQuickPick.items = fontWeights.map(weight => ({ label: weight }));
    weightQuickPick.placeholder = `Select a font weight for ${selectedFont}`;

    // Function to apply the selected font weight
    const applyWeight = (weight: string | undefined) => {
        if (weight) {
            config.update('fontWeight', weight, vscode.ConfigurationTarget.Global);
        }
    };

    // Handle weight selection change
    weightQuickPick.onDidChangeActive(weightItems => {
        const selectedWeight = weightItems[0]?.label;
        applyWeight(selectedWeight);
    });

    // Handle weight selection acceptance
    weightQuickPick.onDidAccept(() => {
        const selectedWeight = weightQuickPick.selectedItems[0]?.label;
        applyWeight(selectedWeight);
        weightQuickPick.dispose();
    });

    // Handle weight selection hiding (return to font selection)
    weightQuickPick.onDidHide(() => {
        if (!weightQuickPick.selectedItems.length) {
            fontQuickPick.show();
        }
        weightQuickPick.dispose();
    });

    weightQuickPick.show();
    fontQuickPick.hide();
};

// VS Code command to list and select a monospaced font
export function activate(context: vscode.ExtensionContext) {
    // Register the command to select a monospaced font
    const disposable = vscode.commands.registerCommand('extension.selectMonospacedFont', async () => {
        try {
            const fonts = await getMonospacedFonts();
            if (fonts.length === 0) {
                vscode.window.showErrorMessage('No monospaced fonts found on the system.');
                return;
            }

            const config = vscode.workspace.getConfiguration('editor');
            const originalFont = config.get<string>('fontFamily');

            // Handle font selection
            await handleFontSelection(fonts, config, originalFont);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Error fetching fonts: ${errorMessage}`);
        }
    });

    context.subscriptions.push(disposable);
}

// Function called when the extension is deactivated
export function deactivate() {}

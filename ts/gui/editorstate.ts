export interface EditorState
{
    readonly displayMode: DisplayMode;
}

export enum DisplayMode
{
    Normal = 'normal',
    AR = 'ar',
}

export function createEditorState(): EditorState
{
    return {
        displayMode: DisplayMode.Normal,
    };
}
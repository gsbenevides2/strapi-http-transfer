export interface FolderData {
    data: {
        id: number;
        name: string;
        path: string;
        pathId: number;
        children: { count: number };
        files: { count: number };
    }[];
}

export interface IntermediateFileData {
    id: number;
    name: string;
    url: string;
    folderPath: string;
    createFileId?: number;
}

export interface IntermediateFolderData {
    name: string;
    path: string;
    id: number;
    createFolderId?: number;
    pathId: number;
    hasChildrenFolders: boolean;
    childrenFolders: IntermediateFolderData[];
    files: IntermediateFileData[];
}

export interface FileData {
    pagination: {
        page: number;
        pageSize: number;
        total: number;
        pageCount: number;
    }
    results: {
        id: number;
        name: string;
        url: string;
        folderPath: string;
    }[]
}
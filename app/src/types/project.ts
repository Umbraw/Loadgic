//Flexible project node (file or directory).
//'children' is optional; undefined means "not loaded yet".
export type ProjectNode = {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: ProjectNode[]
}

//Represents a file in the project tree.
//Files never have children.
export type FileNode = {
  name: string
  path: string
  type: 'file'
}

//Represents a directory in the project tree.
//Directories always have children (can be empty).
export type DirNode = {
  name: string
  path: string
  type: 'dir'
  children: TreeNode[]
}

//A node in the project tree.
//Can be either a FileNode or a DirNode.
export type TreeNode = FileNode | DirNode

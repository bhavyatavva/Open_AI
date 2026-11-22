# Trees: structure, traversal, and search

A tree is a connected acyclic structure. In a rooted tree, one node is designated the root. A node's children are directly below it; a leaf has no children. For this lesson, height is the number of edges on the longest downward path to a leaf. A single-node tree therefore has height zero. A binary tree has at most two children per node.

In a binary search tree (BST) with distinct keys, all keys in the left subtree of a node are smaller than that node's key and all keys in the right subtree are larger. This property applies recursively throughout the tree. A duplicate-key policy must be defined explicitly for implementations that allow duplicates. A binary tree is not necessarily a binary search tree.

Consider inserting 8, 3, 10, 1, 6 in that order into an initially empty BST. The root is 8. Node 3 is its left child and node 10 its right child. Nodes 1 and 6 become the left and right children of 3. Searching for 6 compares against 8, then 3, then 6. Searching for an absent key stops when the next child link is empty.

Preorder visits the node, left subtree, then right subtree. Inorder visits the left subtree, node, then right subtree. Postorder visits the left subtree, right subtree, then node. For the example tree, inorder yields 1, 3, 6, 8, 10; preorder yields 8, 3, 1, 6, 10; postorder yields 1, 6, 3, 10, 8. Traversal visits each node once and takes O(n) time.

BST search and insertion take O(h) time where h is tree height. Balanced search trees maintain logarithmic height; a plain BST does not guarantee balance. Inserting sorted keys into a plain BST can form a chain with O(n) search time. Recursive traversal uses O(h) stack space. Learning goals: draw the example tree, trace search and traversals, and compare balanced and skewed cases without assuming every tree is balanced.

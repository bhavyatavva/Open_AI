import type { Sample } from './types.ts';

export const SAMPLES: Sample[] = [
  {
    id: 'cell_biology',
    title: 'Cell membranes: structure and transport',
    text: `# Cell membranes: structure and transport

The plasma membrane is a selectively permeable phospholipid bilayer containing proteins and other components. Phospholipids have hydrophilic heads and hydrophobic tails. In a bilayer, the heads face aqueous environments while the tails face inward. The membrane is dynamic rather than a rigid wall. In animal cells, cholesterol helps regulate membrane properties.

Simple diffusion is the net movement of particles down a concentration gradient. Molecules still move randomly at equilibrium, but there is no net concentration-driven movement. Small nonpolar molecules such as oxygen can pass through the lipid bilayer relatively readily. Ions and many polar molecules require transport proteins. Facilitated diffusion uses channels or carriers and does not directly consume ATP; it follows an electrochemical gradient.

Osmosis is the net movement of water across a selectively permeable membrane. In simplified comparisons, water moves toward the side with a higher concentration of solutes that cannot cross the membrane. Tonicity depends on nonpenetrating solutes. An animal cell placed in a hypotonic solution may swell; one in a hypertonic solution may shrink. Plant cells respond differently because their cell walls resist expansion.

Active transport moves substances against their electrochemical gradient using energy. Primary active transport directly uses an energy source such as ATP. Secondary active transport couples movement to another substance's gradient, which must be maintained using energy. The sodium-potassium pump moves three sodium ions out and two potassium ions into an animal cell per ATP hydrolyzed.

Membrane receptors participate in cell signaling. Selective transport contributes to homeostasis but does not mean nothing crosses the membrane. Learning goals: explain bilayer organization; distinguish simple diffusion, facilitated diffusion, and active transport; predict water movement in a stated scenario; identify the role of ATP and gradients. Avoid the misconception that all protein-mediated transport requires ATP directly.
`,
  },
  {
    id: 'data_structures',
    title: 'Trees: structure, traversal, and search',
    text: `# Trees: structure, traversal, and search

A tree is a connected acyclic structure. In a rooted tree, one node is designated the root. A node's children are directly below it; a leaf has no children. For this lesson, height is the number of edges on the longest downward path to a leaf. A single-node tree therefore has height zero. A binary tree has at most two children per node.

In a binary search tree (BST) with distinct keys, all keys in the left subtree of a node are smaller than that node's key and all keys in the right subtree are larger. This property applies recursively throughout the tree. A duplicate-key policy must be defined explicitly for implementations that allow duplicates. A binary tree is not necessarily a binary search tree.

Consider inserting 8, 3, 10, 1, 6 in that order into an initially empty BST. The root is 8. Node 3 is its left child and node 10 its right child. Nodes 1 and 6 become the left and right children of 3. Searching for 6 compares against 8, then 3, then 6. Searching for an absent key stops when the next child link is empty.

Preorder visits the node, left subtree, then right subtree. Inorder visits the left subtree, node, then right subtree. Postorder visits the left subtree, right subtree, then node. For the example tree, inorder yields 1, 3, 6, 8, 10; preorder yields 8, 3, 1, 6, 10; postorder yields 1, 6, 3, 10, 8. Traversal visits each node once and takes O(n) time.

BST search and insertion take O(h) time where h is tree height. Balanced search trees maintain logarithmic height; a plain BST does not guarantee balance. Inserting sorted keys into a plain BST can form a chain with O(n) search time. Recursive traversal uses O(h) stack space. Learning goals: draw the example tree, trace search and traversals, and compare balanced and skewed cases without assuming every tree is balanced.
`,
  },
  {
    id: 'macroeconomics',
    title: 'Inflation: causes, costs, and policy responses',
    text: `# Inflation: causes, costs, and policy responses

Inflation is a sustained rise in the general price level. A rise in one product's price alone does not establish economy-wide inflation. The Consumer Price Index tracks the cost of a representative consumption basket over time. If the basket cost rises from 200 to 210 in one year, the measured inflation rate is (210 - 200) / 200 × 100 = 5 percent. This is a simplified example with a fixed basket.

Demand-pull inflation can occur when aggregate demand grows faster than the economy's capacity to produce goods and services. Cost-push inflation can follow rising input prices or supply disruptions, such as an energy shock. Both mechanisms may operate together. An increase in the price level and an increase in the inflation rate are different concepts. Disinflation is a decline in the inflation rate; deflation is a decline in the general price level.

Real income measures purchasing power. If nominal wages rise by 3 percent while prices rise by 5 percent, purchasing power falls by approximately 2 percent. Unexpected inflation can benefit borrowers with fixed nominal debts and harm lenders, although contract terms matter. Households with incomes that adjust slowly may experience a loss of purchasing power.

Central banks can raise policy interest rates to restrain demand, but this can reduce output and employment in the short run. A supply shock creates a trade-off between stabilizing inflation and supporting activity. Fiscal policy and supply measures can also affect demand and production capacity. Policy effects depend on context and timing, so no response is costless or universally appropriate.

Learning goals: distinguish demand-pull and cost-push mechanisms; calculate a simple inflation rate; distinguish nominal and real changes; explain a policy trade-off using evidence. Discussion scenario: energy costs rise while household spending remains unchanged. Identify what additional information would be needed before recommending a policy response.
`,
  },
];

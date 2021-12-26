## Obsidian Opened Files Plugin

This [Obsidian](https://obsidian.md) plugin keeps files opened until explicitly
closed, turning the app into a more "proper" multi-document editor. This means
that when switching from document A to document B, and then back to document A,
you still have document A's state: your undo/redo history, your position in the
file, your selection, and so on.

Some important notes:

- Behind the scenes, the documents _are_ closed. The plugin saves the undo/redo
  history, last selection, and more, before the underlying editor is discarded.
  This means that there's very little impact on memory usage.

- This plugin is using a number of horrible hacks to achieve its goal, and
  should be considered a "proof of concept" more than anything else. It could be
  broken with any Obsidian update.


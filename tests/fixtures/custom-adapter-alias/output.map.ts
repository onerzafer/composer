export default {
  byPrimitive: {
    Note: (node: { id: string }) => [
      { path: "notes/" + node.id + ".txt", language: "txt" },
    ],
  },
};

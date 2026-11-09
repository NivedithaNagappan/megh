import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("listings", (table) => {
      table.id();
      table.foreignId("property_id").constrained("properties").cascadeOnDelete();
      table.foreignId("agent_id").constrained("agents").nullOnDelete();
      table.string("type", 32); // sale | rent
      table.decimal("price", 12, 2);
      table.string("currency", 3).default("USD");
      table.string("status", 32).default("draft"); // draft | active | pending | closed | expired
      table.timestamp("listed_at").nullable();
      table.timestamp("expires_at").nullable();
      table.text("description").nullable();
      table.integer("views").default(0);
      table.timestamps();
      table.index("type");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("listings");
  },
});

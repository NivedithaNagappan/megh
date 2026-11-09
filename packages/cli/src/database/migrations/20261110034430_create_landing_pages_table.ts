import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("landing_pages", (table) => {
      table.id();
      table.foreignId("campaign_id").constrained("campaigns").nullOnDelete();
      table.string("title");
      table.string("slug").unique();
      table.text("content").nullable();
      table.string("meta_title").nullable();
      table.string("meta_description", 500).nullable();
      table.string("status", 32).default("draft"); // draft | published | archived
      table.timestamp("published_at").nullable();
      table.integer("views").default(0);
      table.integer("conversions").default(0);
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("landing_pages");
  },
});

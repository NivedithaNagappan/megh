import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("utm_links", (table) => {
      table.id();
      table.foreignId("campaign_id").constrained("campaigns").cascadeOnDelete();
      table.string("url", 2048);
      table.string("utm_source", 128);
      table.string("utm_medium", 128);
      table.string("utm_campaign", 128);
      table.string("utm_term", 128).nullable();
      table.string("utm_content", 128).nullable();
      table.string("short_code", 32).nullable().unique();
      table.integer("clicks").default(0);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("utm_links");
  },
});

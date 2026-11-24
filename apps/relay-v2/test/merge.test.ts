import { describe, expect, it } from "vitest";
import { campaignProblems } from "../src/core/campaigns";
import { contactValues, fillUnsubscribe, MERGE_SAMPLES, parseMergeData, renderMerge, unknownMergeFields } from "../src/core/merge";

describe("merge fields", () => {
  it("escapes html values and leaves text values alone", () => {
    const values = { ...MERGE_SAMPLES, "contact.first_name": "<img src=x onerror=alert(1)>" };
    expect(renderMerge("<p>Hi {{ contact.first_name }}</p>", values, "html")).toBe("<p>Hi &lt;img src=x onerror=alert(1)&gt;</p>");
    expect(renderMerge("Hi {{ contact.first_name }}", values, "text")).toBe("Hi <img src=x onerror=alert(1)>");
  });

  it("strips line breaks from subject values", () => {
    const values = { ...MERGE_SAMPLES, "contact.first_name": "Bob\r\nBcc: x@y.z" };
    expect(renderMerge("{{contact.first_name}}", values, "subject")).toBe("BobBcc: x@y.z");
  });

  it("renders in one pass, so a value is never expanded", () => {
    const values = { ...MERGE_SAMPLES, "contact.first_name": "{{contact.email}}" };
    expect(renderMerge("{{contact.first_name}}", values, "text")).toBe("{{contact.email}}");
  });

  it("keeps the unsubscribe placeholder until fillUnsubscribe", () => {
    const rendered = renderMerge("<a href=\"{{unsubscribe_url}}\">x</a>", MERGE_SAMPLES, "html");
    expect(rendered).toContain("{{unsubscribe_url}}");
    expect(fillUnsubscribe(rendered, "https://u.test/x")).toBe('<a href="https://u.test/x">x</a>');
    expect(fillUnsubscribe("{{ unsubscribe_url }}", "#")).toBe("#");
  });

  it("reports only unknown fields", () => {
    expect(unknownMergeFields("{{contact.phone}} {{unsubscribe_url}}")).toEqual(["contact.phone"]);
  });

  it("round-trips merge data and rejects bad json", () => {
    const data = { email: "a@x.com", firstName: "Ann", lastName: null };
    expect(parseMergeData(JSON.stringify(data))).toEqual(data);
    expect(parseMergeData("x")).toBeNull();
    expect(parseMergeData(null)).toBeNull();
  });

  it("joins first and last name for contact.name", () => {
    expect(contactValues({ email: "a@x.com", firstName: "Ann", lastName: "Lee" }, "1 Main St")["contact.name"]).toBe("Ann Lee");
    expect(contactValues({ email: "a@x.com", firstName: null, lastName: null }, "1 Main St").postal_address).toBe("1 Main St");
  });
});

describe("campaign problems", () => {
  it("lists the content problems of an empty draft", () => {
    const empty = { fromEmail: null, subject: "", html: "", text: "", listIds: [] };
    expect(campaignProblems(empty, null)).toEqual([
      "from_missing",
      "subject_missing",
      "html_missing",
      "text_missing",
      "audience_empty",
      "unsubscribe_missing",
      "postal_address_missing",
    ]);
  });
});

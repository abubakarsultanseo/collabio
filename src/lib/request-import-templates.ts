export const importFormats = ["standard", "collab", "tabbed"] as const;
export type ImportFormat = (typeof importFormats)[number];

export const importTemplates: Record<
  ImportFormat,
  { label: string; csv: string }
> = {
  standard: {
    label: "Collabio standard CSV",
    csv: "direction,placement,anchor,target,type,status,created,notes,instructions,reason,updated,viewed,deadline,source_id,original_content,edited_content,document_url,position\r\n",
  },
  collab: {
    label: "Collab sheet · side-by-side partner blocks",
    csv: "Partner A,,,,,,,,,,Partner B,,,,,,,,,\r\n#,Placement Page,Anchor,Target Link,Edit / Guest Post,Status,Notes / Reason,Request Type,Document URL,Listicle Position,#,Placement Page,Anchor,Target Link,Edit / Guest Post,Status,Notes / Reason,Request Type,Document URL,Listicle Position\r\n",
  },
  tabbed: {
    label: "Tabbed sheet · one sender tab",
    csv: "#,Status (mark new as Found),Page URL,Anchor,Target URL,Modification,Existing Sentence,New Sentence / addition,Comments,Request Type,Document URL,Listicle Position\r\n",
  },
};

/** Build an OpenSearch description document for the OPDS catalog. */
export function buildOpenSearchDescriptor(baseUrl: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    "  <ShortName>Bookhouse</ShortName>",
    "  <Description>Search the Bookhouse library</Description>",
    `  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="${baseUrl}/opds/search?q={searchTerms}"/>`,
    "  <InputEncoding>UTF-8</InputEncoding>",
    "  <OutputEncoding>UTF-8</OutputEncoding>",
    "</OpenSearchDescription>",
  ].join("\n");
}

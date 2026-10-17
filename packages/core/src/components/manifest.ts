import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPONENT_VERSION = '1.0.0';

export interface PropSpec {
  name: string;
  label: string;
  type: 'token' | 'enum' | 'number' | 'boolean' | 'string' | 'image' | 'link' | 'list';
  options?: string[];
  required?: boolean;
  group: 'layout' | 'style' | 'content' | 'responsive';
}

export interface ComponentSpec {
  name: string;
  category: 'structure' | 'content' | 'container' | 'blog' | 'embed';
  label: string;
  icon: string;
  props: PropSpec[];
  children: { allow: string[] | '*'; deny?: string[]; text?: boolean };
  defaults: Record<string, unknown>;
  snippet: string;
  since: string;
}

export const manifest: ComponentSpec[] = [
  {
    "name": "Accordion",
    "category": "container",
    "label": "Accordion",
    "icon": "square",
    "props": [
      {
        "name": "title",
        "label": "title",
        "type": "string",
        "group": "content"
      },
      {
        "name": "open",
        "label": "open",
        "type": "boolean",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Accordion></Accordion>",
    "since": "1.0.0"
  },
  {
    "name": "Badge",
    "category": "content",
    "label": "Badge",
    "icon": "square",
    "props": [],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Badge></Badge>",
    "since": "1.0.0"
  },
  {
    "name": "Button",
    "category": "content",
    "label": "Button",
    "icon": "square",
    "props": [
      {
        "name": "href",
        "label": "href",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Button></Button>",
    "since": "1.0.0"
  },
  {
    "name": "Callout",
    "category": "container",
    "label": "Callout",
    "icon": "square",
    "props": [
      {
        "name": "title",
        "label": "title",
        "type": "string",
        "group": "content"
      },
      {
        "name": "type",
        "label": "type",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Callout></Callout>",
    "since": "1.0.0"
  },
  {
    "name": "Card",
    "category": "container",
    "label": "Card",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "href",
        "label": "href",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Card></Card>",
    "since": "1.0.0"
  },
  {
    "name": "CategoryTree",
    "category": "blog",
    "label": "CategoryTree",
    "icon": "square",
    "props": [],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<CategoryTree></CategoryTree>",
    "since": "1.0.0"
  },
  {
    "name": "Code",
    "category": "content",
    "label": "Code",
    "icon": "square",
    "props": [
      {
        "name": "code",
        "label": "code",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Code></Code>",
    "since": "1.0.0"
  },
  {
    "name": "Column",
    "category": "structure",
    "label": "Column",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Column></Column>",
    "since": "1.0.0"
  },
  {
    "name": "Columns",
    "category": "structure",
    "label": "Columns",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "cols",
        "label": "cols",
        "type": "number",
        "group": "content"
      },
      {
        "name": "gap",
        "label": "gap",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Columns></Columns>",
    "since": "1.0.0"
  },
  {
    "name": "Container",
    "category": "structure",
    "label": "Container",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "width",
        "label": "width",
        "type": "enum",
        "group": "content"
      },
      {
        "name": "align",
        "label": "align",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Container></Container>",
    "since": "1.0.0"
  },
  {
    "name": "Divider",
    "category": "content",
    "label": "Divider",
    "icon": "square",
    "props": [],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Divider></Divider>",
    "since": "1.0.0"
  },
  {
    "name": "Embed",
    "category": "embed",
    "label": "Embed",
    "icon": "square",
    "props": [
      {
        "name": "src",
        "label": "src",
        "type": "string",
        "group": "content"
      },
      {
        "name": "title",
        "label": "title",
        "type": "string",
        "group": "content"
      },
      {
        "name": "ratio",
        "label": "ratio",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Embed></Embed>",
    "since": "1.0.0"
  },
  {
    "name": "Gallery",
    "category": "embed",
    "label": "Gallery",
    "icon": "square",
    "props": [
      {
        "name": "images",
        "label": "images",
        "type": "list",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Gallery></Gallery>",
    "since": "1.0.0"
  },
  {
    "name": "Grid",
    "category": "structure",
    "label": "Grid",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "gap",
        "label": "gap",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Grid></Grid>",
    "since": "1.0.0"
  },
  {
    "name": "Heading",
    "category": "content",
    "label": "Heading",
    "icon": "square",
    "props": [
      {
        "name": "level",
        "label": "level",
        "type": "number",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Heading></Heading>",
    "since": "1.0.0"
  },
  {
    "name": "Html",
    "category": "embed",
    "label": "Html",
    "icon": "square",
    "props": [],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Html></Html>",
    "since": "1.0.0"
  },
  {
    "name": "Icon",
    "category": "content",
    "label": "Icon",
    "icon": "square",
    "props": [
      {
        "name": "name",
        "label": "name",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Icon></Icon>",
    "since": "1.0.0"
  },
  {
    "name": "Image",
    "category": "embed",
    "label": "Image",
    "icon": "square",
    "props": [
      {
        "name": "src",
        "label": "src",
        "type": "string",
        "group": "content"
      },
      {
        "name": "alt",
        "label": "alt",
        "type": "string",
        "group": "content"
      },
      {
        "name": "caption",
        "label": "caption",
        "type": "string",
        "group": "content"
      },
      {
        "name": "ratio",
        "label": "ratio",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Image></Image>",
    "since": "1.0.0"
  },
  {
    "name": "Link",
    "category": "content",
    "label": "Link",
    "icon": "square",
    "props": [
      {
        "name": "href",
        "label": "href",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Link></Link>",
    "since": "1.0.0"
  },
  {
    "name": "Pagination",
    "category": "blog",
    "label": "Pagination",
    "icon": "square",
    "props": [
      {
        "name": "prev",
        "label": "prev",
        "type": "string",
        "group": "content"
      },
      {
        "name": "next",
        "label": "next",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Pagination></Pagination>",
    "since": "1.0.0"
  },
  {
    "name": "PostCard",
    "category": "blog",
    "label": "PostCard",
    "icon": "square",
    "props": [
      {
        "name": "slug",
        "label": "slug",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<PostCard></PostCard>",
    "since": "1.0.0"
  },
  {
    "name": "PostList",
    "category": "blog",
    "label": "PostList",
    "icon": "square",
    "props": [
      {
        "name": "limit",
        "label": "limit",
        "type": "number",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<PostList></PostList>",
    "since": "1.0.0"
  },
  {
    "name": "Profile",
    "category": "blog",
    "label": "Profile",
    "icon": "square",
    "props": [],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Profile></Profile>",
    "since": "1.0.0"
  },
  {
    "name": "Quote",
    "category": "content",
    "label": "Quote",
    "icon": "square",
    "props": [
      {
        "name": "cite",
        "label": "cite",
        "type": "string",
        "group": "content"
      }
    ],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Quote></Quote>",
    "since": "1.0.0"
  },
  {
    "name": "RichText",
    "category": "content",
    "label": "RichText",
    "icon": "square",
    "props": [],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<RichText></RichText>",
    "since": "1.0.0"
  },
  {
    "name": "Section",
    "category": "structure",
    "label": "Section",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "width",
        "label": "width",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Section></Section>",
    "since": "1.0.0"
  },
  {
    "name": "Spacer",
    "category": "content",
    "label": "Spacer",
    "icon": "square",
    "props": [
      {
        "name": "size",
        "label": "size",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Spacer></Spacer>",
    "since": "1.0.0"
  },
  {
    "name": "Stack",
    "category": "structure",
    "label": "Stack",
    "icon": "square",
    "props": [
      {
        "name": "pad",
        "label": "pad",
        "type": "string",
        "group": "content"
      },
      {
        "name": "bg",
        "label": "bg",
        "type": "string",
        "group": "content"
      },
      {
        "name": "hideOn",
        "label": "hideOn",
        "type": "string",
        "group": "content"
      },
      {
        "name": "direction",
        "label": "direction",
        "type": "string",
        "group": "content"
      },
      {
        "name": "gap",
        "label": "gap",
        "type": "enum",
        "group": "content"
      },
      {
        "name": "align",
        "label": "align",
        "type": "enum",
        "group": "content"
      },
      {
        "name": "justify",
        "label": "justify",
        "type": "string",
        "group": "content"
      },
      {
        "name": "wrap",
        "label": "wrap",
        "type": "boolean",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Stack></Stack>",
    "since": "1.0.0"
  },
  {
    "name": "TabPanel",
    "category": "container",
    "label": "TabPanel",
    "icon": "square",
    "props": [],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<TabPanel></TabPanel>",
    "since": "1.0.0"
  },
  {
    "name": "Tabs",
    "category": "container",
    "label": "Tabs",
    "icon": "square",
    "props": [
      {
        "name": "labels",
        "label": "labels",
        "type": "list",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Tabs></Tabs>",
    "since": "1.0.0"
  },
  {
    "name": "TagCloud",
    "category": "blog",
    "label": "TagCloud",
    "icon": "square",
    "props": [
      {
        "name": "limit",
        "label": "limit",
        "type": "number",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<TagCloud></TagCloud>",
    "since": "1.0.0"
  },
  {
    "name": "Text",
    "category": "content",
    "label": "Text",
    "icon": "square",
    "props": [],
    "children": {
      "allow": [],
      "text": true
    },
    "defaults": {},
    "snippet": "<Text></Text>",
    "since": "1.0.0"
  },
  {
    "name": "Toc",
    "category": "blog",
    "label": "Toc",
    "icon": "square",
    "props": [
      {
        "name": "headings",
        "label": "headings",
        "type": "list",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Toc></Toc>",
    "since": "1.0.0"
  },
  {
    "name": "Video",
    "category": "embed",
    "label": "Video",
    "icon": "square",
    "props": [
      {
        "name": "src",
        "label": "src",
        "type": "string",
        "group": "content"
      },
      {
        "name": "ratio",
        "label": "ratio",
        "type": "enum",
        "group": "content"
      }
    ],
    "children": {
      "allow": "*"
    },
    "defaults": {},
    "snippet": "<Video></Video>",
    "since": "1.0.0"
  }
];

export function templateVersionFile(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../packages/template/src/components/xiao/VERSION');
}

export function versionsMatch(disk = readFileSync(templateVersionFile(), 'utf8').trim()): boolean {
  return manifest.every((item) => item.since === disk) && disk === COMPONENT_VERSION;
}

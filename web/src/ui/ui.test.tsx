import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Button,
  Drawer,
  IconButton,
  Panel,
  SegmentedToggle,
  TabPanel,
  Tabs,
  nextTabIndex,
} from "./index";

describe("nextTabIndex", () => {
  it("moves with the arrows and wraps at both ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
  });

  it("jumps with Home and End, and ignores every other key", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 0, 4)).toBe(3);
    expect(nextTabIndex("Enter", 1, 4)).toBeNull();
    expect(nextTabIndex("ArrowDown", 1, 4)).toBeNull();
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "globe", label: "Globe" },
    { id: "stability", label: "Stability" },
  ];
  const html = renderToStaticMarkup(
    <Tabs
      tabs={tabs}
      value="stability"
      onChange={() => {}}
      label="Views"
      idPrefix="v"
    />,
  );

  it("is a labelled tablist whose tabs say which is selected", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Views"');
    expect(html).toMatch(/id="v-tab-stability"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="v-tab-globe"[^>]*aria-selected="false"/);
  });

  it("puts only the selected tab in the tab order (roving tabindex)", () => {
    expect(html).toMatch(/id="v-tab-stability"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="v-tab-globe"[^>]*tabindex="-1"/);
  });

  it("points each tab at its panel, and hides the inactive panel", () => {
    expect(html).toContain('aria-controls="v-panel-stability"');
    const active = renderToStaticMarkup(
      <TabPanel id="stability" idPrefix="v" active>
        x
      </TabPanel>,
    );
    const inactive = renderToStaticMarkup(
      <TabPanel id="globe" idPrefix="v" active={false}>
        x
      </TabPanel>,
    );
    expect(active).toContain('id="v-panel-stability"');
    expect(active).toContain('aria-labelledby="v-tab-stability"');
    expect(active).not.toContain("hidden");
    expect(inactive).toContain("hidden");
  });
});

describe("SegmentedToggle", () => {
  const html = renderToStaticMarkup(
    <SegmentedToggle
      label="Model"
      value="b"
      onChange={() => {}}
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ]}
    />,
  );

  it("names the group and marks only the selected option as pressed", () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Model"');
    expect(html).toMatch(/aria-pressed="false"[^>]*>A</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>B</);
  });
});

describe("Drawer", () => {
  it("is inert and off-screen while closed", () => {
    const closed = renderToStaticMarkup(<Drawer open={false}>x</Drawer>);
    expect(closed).toContain("inert");
    expect(closed).toContain("translate-x-full");
  });

  it("is reachable and on-screen while open, and takes the caller's geometry", () => {
    const open = renderToStaticMarkup(
      <Drawer open className="w-[380px]">
        x
      </Drawer>,
    );
    expect(open).not.toContain("inert");
    expect(open).toContain("translate-x-0");
    expect(open).toContain("w-[380px]");
  });
});

describe("Button, IconButton and Panel", () => {
  it("default to type=button, so they never submit a form", () => {
    expect(renderToStaticMarkup(<Button>go</Button>)).toContain(
      'type="button"',
    );
    expect(
      renderToStaticMarkup(<IconButton aria-label="Close">x</IconButton>),
    ).toContain('type="button"');
  });

  it("pass disabled and the accent tone through", () => {
    const html = renderToStaticMarkup(
      <Button disabled tone="accent">
        go
      </Button>,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("text-accent");
  });

  it("IconButton carries its aria-label", () => {
    expect(
      renderToStaticMarkup(
        <IconButton aria-label="Close controls">x</IconButton>,
      ),
    ).toContain('aria-label="Close controls"');
  });

  it("Panel draws a heading only when given a title", () => {
    expect(renderToStaticMarkup(<Panel title="Network">x</Panel>)).toContain(
      "<h2",
    );
    expect(renderToStaticMarkup(<Panel>x</Panel>)).not.toContain("<h2");
  });
});

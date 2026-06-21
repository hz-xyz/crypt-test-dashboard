import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddressQR, CopyableField } from "@/components/console/address-display";

describe("CopyableField", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("copies the value and shows feedback", async () => {
    render(<CopyableField label="收款地址" value="0xAbc" />);
    fireEvent.click(screen.getByRole("button", { name: /复制/ }));
    expect(writeText).toHaveBeenCalledWith("0xAbc");
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });
});

describe("AddressQR", () => {
  it("renders an svg QR for a non-empty address", () => {
    const { container } = render(<AddressQR address="0xAbc" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders nothing for an empty address", () => {
    const { container } = render(<AddressQR address="" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { InfoView, TokenInfo } from "@/lib/types";

/** A single labelled config value. */
function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card/40 p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

function fmt(n?: number): string {
  return n === undefined ? "—" : n.toLocaleString();
}

/** Render a fee given in basis points as a percent, e.g. 50 -> "0.5%". */
function feeText(bps?: number): string {
  return bps === undefined ? "—" : `${(bps / 100).toLocaleString()}%`;
}

function TokenRow({ token }: { token: TokenInfo }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
          {token.symbol}
        </span>
        {token.decimals !== undefined ? (
          <span className="text-xs text-muted-foreground">
            {token.decimals} decimals
          </span>
        ) : null}
        {token.feeBps !== undefined ? (
          <span className="text-xs text-muted-foreground">
            费率 {feeText(token.feeBps)}
          </span>
        ) : null}
      </div>
      <span
        className="truncate font-mono text-xs text-muted-foreground"
        title={token.address}
      >
        {token.address ?? "合约地址未知"}
      </span>
    </div>
  );
}

export function ChainInfo({
  info,
  isLoading,
}: {
  info?: InfoView;
  isLoading: boolean;
}) {
  if (isLoading && !info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>链配置</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-12 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const tokens = info?.tokens ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>链配置</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field
            label="链 ID"
            value={fmt(info?.chainId)}
            hint={info?.chainName}
          />
          <Field
            label="确认数"
            value={fmt(info?.confirmations)}
            hint="confirmations"
          />
          <Field
            label="费率"
            value={feeText(info?.feeBps)}
            hint="网关默认费率"
          />
          <Field
            label="Token 数"
            value={fmt(tokens.length || undefined)}
            hint="支持的合约"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Token 合约地址
          </span>
          {tokens.length > 0 ? (
            <div className="flex flex-col gap-2">
              {tokens.map((t) => (
                <TokenRow key={t.symbol} token={t} />
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              网关未返回 token 配置。
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

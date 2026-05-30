// Sample React component used by the 003 US1 tests as input to
// `@composer/ingest-react`. Deliberately covers the prop-type shapes the
// MVP must handle: required string/number/boolean, optional, and a string
// literal union (the "variant" pattern).

export interface CardProps {
  title: string;
  body: string;
  count: number;
  variant?: "default" | "highlighted";
  disabled?: boolean;
}

export function Card(props: CardProps) {
  return (
    <div className={"card " + (props.variant ?? "default")}>
      <h3>{props.title}</h3>
      <p>{props.body}</p>
      <span data-count={props.count}>{props.count}</span>
      {props.disabled ? <span> (disabled)</span> : null}
    </div>
  );
}

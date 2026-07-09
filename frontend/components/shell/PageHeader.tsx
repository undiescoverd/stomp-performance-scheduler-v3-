interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  lead?: string;
  actions?: React.ReactNode;
  /** heading scale — the big hero (default) or a smaller section title */
  size?: "display" | "h1";
}

export function PageHeader({ eyebrow, title, lead, actions, size = "display" }: PageHeaderProps) {
  return (
    <section className="section-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className={`${size === "display" ? "h-display" : "h1"} mt-8`}>{title}</h1>
        {lead ? <p className="lead mt-8">{lead}</p> : null}
      </div>
      {actions ? <div className="row-wrap">{actions}</div> : null}
    </section>
  );
}

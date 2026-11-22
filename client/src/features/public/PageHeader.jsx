import styles from './Pages.module.css';

/** Heading block shared by the inner pages. */
export function PageHeader({ eyebrow, title, lead, children }) {
  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.display}>{title}</h1>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        {children}
      </div>
    </div>
  );
}

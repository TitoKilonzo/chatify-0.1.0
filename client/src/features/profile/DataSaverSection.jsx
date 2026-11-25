import { Gauge } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { browserPrefersSavingData, isSavingData, useDataSaver } from '../../stores/dataSaver.js';
import styles from './Settings.module.css';

export function DataSaverSection() {
  const choice = useDataSaver((state) => state.choice);
  const setChoice = useDataSaver((state) => state.set);
  const on = isSavingData(choice);

  return (
    <section className={styles.section} aria-labelledby="saver-heading">
      <h2 id="saver-heading" className={styles.heading}>
        Data saver
      </h2>
      <p className={styles.note}>
        Photos are not downloaded until you tap them. Text, voice notes and files are unaffected.
        {choice === null && browserPrefersSavingData()
          ? ' It is on now because your browser asks to save data.'
          : ''}
      </p>
      <div>
        <Button variant="secondary" leadingIcon={Gauge} onClick={() => setChoice(!on)}>
          {on ? 'Turn data saver off' : 'Turn data saver on'}
        </Button>
      </div>
    </section>
  );
}

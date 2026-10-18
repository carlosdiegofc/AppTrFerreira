import { Icon } from '../components/Icon';
import { PageHead } from '../components/ui';
import type { Section } from '../sections';

export function Proximamente({ section }: { section: Section }) {
  return (
    <div className="page">
      <PageHead title={section.label} />
      <section className="card soon-card">
        <span className="soon-icon">
          <Icon name={section.icon} size={30} />
        </span>
        <h2>Próximamente</h2>
        <p>{section.about}</p>
        {section.meanwhile && (
          <p className="soon-meanwhile">
            {section.meanwhile.text}
            {section.meanwhile.href && (
              <>
                {' '}
                <a href={section.meanwhile.href} target="_blank" rel="noopener noreferrer">
                  Abrir el panel actual <Icon name="external" size={15} />
                </a>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}

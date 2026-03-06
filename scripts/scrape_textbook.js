import { writeFileSync } from 'fs';

const BASE = 'https://inferentialthinking.com';
const DELAY_MS = 250;

const PAGES = [
  { data: '/index.json', url: '/' },
  { data: '/chapters.01.what-is-data-science.json', url: '/chapters/01/what-is-data-science' },
  { data: '/chapters.01.1.intro.json', url: '/chapters/01/1/intro' },
  { data: '/chapters.01.1.1.computational-tools.json', url: '/chapters/01/1/1/computational-tools' },
  { data: '/chapters.01.1.2.statistical-techniques.json', url: '/chapters/01/1/2/statistical-techniques' },
  { data: '/chapters.01.2.why-data-science.json', url: '/chapters/01/2/why-data-science' },
  { data: '/chapters.01.3.plotting-the-classics.json', url: '/chapters/01/3/plotting-the-classics' },
  { data: '/chapters.01.3.1.literary-characters.json', url: '/chapters/01/3/1/literary-characters' },
  { data: '/chapters.01.3.2.another-kind-of-character.json', url: '/chapters/01/3/2/another-kind-of-character' },
  { data: '/chapters.02.causality-and-experiments.json', url: '/chapters/02/causality-and-experiments' },
  { data: '/chapters.02.1.observation-and-visualization-john-snow-and-the-br.json', url: '/chapters/02/1/observation-and-visualization-john-snow-and-the-br' },
  { data: '/chapters.02.2.snow-s-grand-experiment.json', url: '/chapters/02/2/snow-s-grand-experiment' },
  { data: '/chapters.02.3.establishing-causality.json', url: '/chapters/02/3/establishing-causality' },
  { data: '/chapters.02.4.randomization.json', url: '/chapters/02/4/randomization' },
  { data: '/chapters.02.5.endnote.json', url: '/chapters/02/5/endnote' },
  { data: '/chapters.03.programming-in-python.json', url: '/chapters/03/programming-in-python' },
  { data: '/chapters.03.1.expressions.json', url: '/chapters/03/1/expressions' },
  { data: '/chapters.03.2.names.json', url: '/chapters/03/2/names' },
  { data: '/chapters.03.2.1.growth.json', url: '/chapters/03/2/1/growth' },
  { data: '/chapters.03.3.calls.json', url: '/chapters/03/3/calls' },
  { data: '/chapters.03.4.introduction-to-tables.json', url: '/chapters/03/4/introduction-to-tables' },
  { data: '/chapters.04.data-types.json', url: '/chapters/04/data-types' },
  { data: '/chapters.04.1.numbers.json', url: '/chapters/04/1/numbers' },
  { data: '/chapters.04.2.strings.json', url: '/chapters/04/2/strings' },
  { data: '/chapters.04.2.1.string-methods.json', url: '/chapters/04/2/1/string-methods' },
  { data: '/chapters.04.3.comparison.json', url: '/chapters/04/3/comparison' },
  { data: '/chapters.05.sequences.json', url: '/chapters/05/sequences' },
  { data: '/chapters.05.1.arrays.json', url: '/chapters/05/1/arrays' },
  { data: '/chapters.05.2.ranges.json', url: '/chapters/05/2/ranges' },
  { data: '/chapters.05.3.more-on-arrays.json', url: '/chapters/05/3/more-on-arrays' },
  { data: '/chapters.06.tables.json', url: '/chapters/06/tables' },
  { data: '/chapters.06.1.sorting-rows.json', url: '/chapters/06/1/sorting-rows' },
  { data: '/chapters.06.2.selecting-rows.json', url: '/chapters/06/2/selecting-rows' },
  { data: '/chapters.06.3.example-population-trends.json', url: '/chapters/06/3/example-population-trends' },
  { data: '/chapters.06.4.example-sex-ratios.json', url: '/chapters/06/4/example-sex-ratios' },
  { data: '/chapters.07.visualization.json', url: '/chapters/07/visualization' },
  { data: '/chapters.07.1.visualizing-categorical-distributions.json', url: '/chapters/07/1/visualizing-categorical-distributions' },
  { data: '/chapters.07.2.visualizing-numerical-distributions.json', url: '/chapters/07/2/visualizing-numerical-distributions' },
  { data: '/chapters.07.3.overlaid-graphs.json', url: '/chapters/07/3/overlaid-graphs' },
  { data: '/chapters.08.functions-and-tables.json', url: '/chapters/08/functions-and-tables' },
  { data: '/chapters.08.1.applying-a-function-to-a-column.json', url: '/chapters/08/1/applying-a-function-to-a-column' },
  { data: '/chapters.08.2.classifying-by-one-variable.json', url: '/chapters/08/2/classifying-by-one-variable' },
  { data: '/chapters.08.3.cross-classifying-by-more-than-one-variable.json', url: '/chapters/08/3/cross-classifying-by-more-than-one-variable' },
  { data: '/chapters.08.4.joining-tables-by-columns.json', url: '/chapters/08/4/joining-tables-by-columns' },
  { data: '/chapters.08.5.bike-sharing-in-the-bay-area.json', url: '/chapters/08/5/bike-sharing-in-the-bay-area' },
  { data: '/chapters.09.randomness.json', url: '/chapters/09/randomness' },
  { data: '/chapters.09.1.conditional-statements.json', url: '/chapters/09/1/conditional-statements' },
  { data: '/chapters.09.2.iteration.json', url: '/chapters/09/2/iteration' },
  { data: '/chapters.09.3.simulation.json', url: '/chapters/09/3/simulation' },
  { data: '/chapters.09.4.monty-hall-problem.json', url: '/chapters/09/4/monty-hall-problem' },
  { data: '/chapters.09.5.finding-probabilities.json', url: '/chapters/09/5/finding-probabilities' },
  { data: '/chapters.10.sampling-and-empirical-distributions.json', url: '/chapters/10/sampling-and-empirical-distributions' },
  { data: '/chapters.10.1.empirical-distributions.json', url: '/chapters/10/1/empirical-distributions' },
  { data: '/chapters.10.2.sampling-from-a-population.json', url: '/chapters/10/2/sampling-from-a-population' },
  { data: '/chapters.10.3.empirical-distribution-of-a-statistic.json', url: '/chapters/10/3/empirical-distribution-of-a-statistic' },
  { data: '/chapters.10.4.random-sampling-in-python.json', url: '/chapters/10/4/random-sampling-in-python' },
  { data: '/chapters.11.testing-hypotheses.json', url: '/chapters/11/testing-hypotheses' },
  { data: '/chapters.11.1.assessing-a-model.json', url: '/chapters/11/1/assessing-a-model' },
  { data: '/chapters.11.2.multiple-categories.json', url: '/chapters/11/2/multiple-categories' },
  { data: '/chapters.11.3.decisions-and-uncertainty.json', url: '/chapters/11/3/decisions-and-uncertainty' },
  { data: '/chapters.11.4.error-probabilities.json', url: '/chapters/11/4/error-probabilities' },
  { data: '/chapters.12.comparing-two-samples.json', url: '/chapters/12/comparing-two-samples' },
  { data: '/chapters.12.1.ab-testing.json', url: '/chapters/12/1/ab-testing' },
  { data: '/chapters.12.2.causality.json', url: '/chapters/12/2/causality' },
  { data: '/chapters.12.3.deflategate.json', url: '/chapters/12/3/deflategate' },
  { data: '/chapters.13.estimation.json', url: '/chapters/13/estimation' },
  { data: '/chapters.13.1.percentiles.json', url: '/chapters/13/1/percentiles' },
  { data: '/chapters.13.2.bootstrap.json', url: '/chapters/13/2/bootstrap' },
  { data: '/chapters.13.3.confidence-intervals.json', url: '/chapters/13/3/confidence-intervals' },
  { data: '/chapters.13.4.using-confidence-intervals.json', url: '/chapters/13/4/using-confidence-intervals' },
  { data: '/chapters.14.why-the-mean-matters.json', url: '/chapters/14/why-the-mean-matters' },
  { data: '/chapters.14.1.properties-of-the-mean.json', url: '/chapters/14/1/properties-of-the-mean' },
  { data: '/chapters.14.2.variability.json', url: '/chapters/14/2/variability' },
  { data: '/chapters.14.3.sd-and-the-normal-curve.json', url: '/chapters/14/3/sd-and-the-normal-curve' },
  { data: '/chapters.14.4.central-limit-theorem.json', url: '/chapters/14/4/central-limit-theorem' },
  { data: '/chapters.14.5.variability-of-the-sample-mean.json', url: '/chapters/14/5/variability-of-the-sample-mean' },
  { data: '/chapters.14.6.choosing-a-sample-size.json', url: '/chapters/14/6/choosing-a-sample-size' },
  { data: '/chapters.15.prediction.json', url: '/chapters/15/prediction' },
  { data: '/chapters.15.1.correlation.json', url: '/chapters/15/1/correlation' },
  { data: '/chapters.15.2.regression-line.json', url: '/chapters/15/2/regression-line' },
  { data: '/chapters.15.3.method-of-least-squares.json', url: '/chapters/15/3/method-of-least-squares' },
  { data: '/chapters.15.4.least-squares-regression.json', url: '/chapters/15/4/least-squares-regression' },
  { data: '/chapters.15.5.visual-diagnostics.json', url: '/chapters/15/5/visual-diagnostics' },
  { data: '/chapters.15.6.numerical-diagnostics.json', url: '/chapters/15/6/numerical-diagnostics' },
  { data: '/chapters.16.inference-for-regression.json', url: '/chapters/16/inference-for-regression' },
  { data: '/chapters.16.1.regression-model.json', url: '/chapters/16/1/regression-model' },
  { data: '/chapters.16.2.inference-for-the-true-slope.json', url: '/chapters/16/2/inference-for-the-true-slope' },
  { data: '/chapters.16.3.prediction-intervals.json', url: '/chapters/16/3/prediction-intervals' },
  { data: '/chapters.17.classification.json', url: '/chapters/17/classification' },
  { data: '/chapters.17.1.nearest-neighbors.json', url: '/chapters/17/1/nearest-neighbors' },
  { data: '/chapters.17.2.training-and-testing.json', url: '/chapters/17/2/training-and-testing' },
  { data: '/chapters.17.3.rows-of-tables.json', url: '/chapters/17/3/rows-of-tables' },
  { data: '/chapters.17.4.implementing-the-classifier.json', url: '/chapters/17/4/implementing-the-classifier' },
  { data: '/chapters.17.5.accuracy-of-the-classifier.json', url: '/chapters/17/5/accuracy-of-the-classifier' },
  { data: '/chapters.17.6.multiple-regression.json', url: '/chapters/17/6/multiple-regression' },
  { data: '/chapters.18.updating-predictions.json', url: '/chapters/18/updating-predictions' },
  { data: '/chapters.18.1.more-likely-than-not-binary-classifier.json', url: '/chapters/18/1/more-likely-than-not-binary-classifier' },
  { data: '/chapters.18.2.making-decisions.json', url: '/chapters/18/2/making-decisions' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recursively extract plain text from a MyST mdast node.
 * Handles paragraphs, headings, code blocks, tables, lists, emphasis, etc.
 */
function extractText(node) {
  if (!node) return '';

  if (typeof node === 'string') return node;

  switch (node.type) {
    case 'text':
      return node.value || '';

    case 'inlineCode':
      return `\`${node.value || ''}\``;

    case 'code': {
      const lang = node.lang || '';
      const val = node.value || '';
      return `\n\`\`\`${lang}\n${val}\n\`\`\`\n`;
    }

    case 'heading': {
      const depth = node.depth || 1;
      const prefix = '#'.repeat(depth) + ' ';
      const text = childrenText(node);
      return `\n${prefix}${text}\n`;
    }

    case 'paragraph':
      return childrenText(node) + '\n';

    case 'blockquote':
      return childrenText(node).split('\n').map(l => `> ${l}`).join('\n') + '\n';

    case 'list': {
      const items = (node.children || []).map((item, i) => {
        const bullet = node.ordered ? `${i + 1}. ` : '- ';
        const text = extractText(item).trim();
        return bullet + text;
      });
      return '\n' + items.join('\n') + '\n';
    }

    case 'listItem':
      return childrenText(node);

    case 'table': {
      const rows = (node.children || []).map(row => {
        const cells = (row.children || []).map(cell => extractText(cell).trim());
        return '| ' + cells.join(' | ') + ' |';
      });
      if (rows.length > 0) {
        const headerCells = (node.children[0]?.children || []).length;
        const sep = '| ' + Array(headerCells).fill('---').join(' | ') + ' |';
        rows.splice(1, 0, sep);
      }
      return '\n' + rows.join('\n') + '\n';
    }

    case 'emphasis':
    case 'strong':
      return childrenText(node);

    case 'link': {
      const text = childrenText(node);
      return node.url ? `${text} (${node.url})` : text;
    }

    case 'image':
      return `[Image: ${node.alt || node.url || ''}]\n`;

    case 'math':
      return node.value ? `\n$$\n${node.value}\n$$\n` : '';

    case 'inlineMath':
      return node.value ? `$${node.value}$` : '';

    case 'thematicBreak':
      return '\n---\n';

    case 'output': {
      const items = node.data || [];
      const parts = [];
      for (const item of items) {
        if (item.output_type === 'stream' && item.text) {
          parts.push(item.text.join ? item.text.join('') : item.text);
        }
        if (item.output_type === 'execute_result' || item.output_type === 'display_data') {
          const textData = item.data?.['text/plain'];
          if (textData) {
            parts.push(Array.isArray(textData) ? textData.join('') : textData);
          }
          const htmlData = item.data?.['text/html'];
          if (htmlData && !textData) {
            parts.push('[HTML output omitted]');
          }
        }
      }
      if (parts.length > 0) {
        return '\n' + parts.join('\n').trim() + '\n';
      }
      return '';
    }

    case 'break':
      return '\n';

    case 'footnoteDefinition':
    case 'footnoteReference':
      return childrenText(node);

    default:
      return childrenText(node);
  }
}

function childrenText(node) {
  if (!node.children || !Array.isArray(node.children)) return '';
  return node.children.map(extractText).join('');
}

/**
 * Clean up excessive whitespace while preserving intentional formatting.
 */
function cleanText(text) {
  return text
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

async function scrapePage(page) {
  const dataUrl = `${BASE}${page.data}`;
  const pageUrl = page.url === '/'
    ? `${BASE}/`
    : `${BASE}${page.url}/index.html`;

  const resp = await fetch(dataUrl);
  if (!resp.ok) {
    console.error(`  FAILED (${resp.status}): ${dataUrl}`);
    return null;
  }

  const json = await resp.json();
  const title = json.frontmatter?.title || 'Untitled';
  const enumerator = json.frontmatter?.enumerator || '';
  const displayTitle = enumerator ? `${enumerator} ${title}` : title;

  const mdast = json.mdast;
  const bodyText = extractText(mdast);
  const cleaned = cleanText(bodyText);

  return { displayTitle, pageUrl, content: cleaned };
}

async function main() {
  const output = [];

  output.push('Computational and Inferential Thinking: The Foundations of Data Science');
  output.push('2nd Edition by Ani Adhikari, John DeNero, David Wagner');
  output.push('Source: https://inferentialthinking.com/');
  output.push('');
  output.push('='.repeat(80));
  output.push('');

  console.log(`Scraping ${PAGES.length} pages from inferentialthinking.com...\n`);

  for (let i = 0; i < PAGES.length; i++) {
    const page = PAGES[i];
    console.log(`[${i + 1}/${PAGES.length}] Fetching ${page.url} ...`);

    const result = await scrapePage(page);
    if (!result) continue;

    output.push('='.repeat(80));
    output.push(`${result.displayTitle} [${result.pageUrl}]`);
    output.push('='.repeat(80));
    output.push('');
    output.push(result.content);
    output.push('');
    output.push('');

    if (i < PAGES.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const outPath = 'textbook_content.txt';
  writeFileSync(outPath, output.join('\n'), 'utf-8');
  console.log(`\nDone! Wrote ${PAGES.length} sections to ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

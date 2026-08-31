export const HELP_HTML_EN = `
<p class="help-lead">
  This app uses a simplified <strong>cohort-component</strong> model.
  You see <strong>5-year age bars</strong>, but the engine ages people by
  <strong>single years of age</strong> (0, 1, 2, …), then groups them for the chart.
</p>

<h3>1. Start: expand 5-year data to single ages</h3>
<p>
  Base age–sex counts are a <strong>2024 five-year extract</strong> of
  <strong>UN World Population Prospects 2024</strong>
  (via PopulationPyramid.net when a direct extract is not bundled).
  Each band such as 0–4 is split into five equal single-year ages at the start of a run.
  The 100+ group stays one bar.
</p>

<h3>2. Each simulated year (in order)</h3>
<ol class="help-steps">
  <li><strong>Deaths</strong> — each single year of age is multiplied by a survival rate from a <em>stylized</em> age schedule, scaled by life expectancy (not an official UN life table). Those deaths fill the <em>mortality pyramid</em>.</li>
  <li><strong>Births</strong> — women aged 15–49 produce children from the TFR and a fixed age pattern of fertility. Births by age of mother fill the <em>fertility pyramid</em> (boys vs girls from the sex ratio at birth).</li>
  <li><strong>Age +1 year</strong> — everyone moves up one year of age. Age 99 joins the 100+ group.</li>
  <li><strong>Migration</strong> — optional. If the migration <em>Use</em> box is off (the default), the simulation adds <strong>zero</strong> net migrants. If it is on, people are added or removed with a peak around age 28. The world-map migration heatmaps still read UN WPP even when the simulation uses zero.</li>
  <li><strong>Display</strong> — single ages are summed back into 0–4, 5–9, … 100+ for the pyramids.</li>
</ol>

<pre class="help-formula">births_g = women_g × (TFR × share_g) / 5</pre>
<p>The /5 turns a lifetime TFR into a one-year flow for a 5-year age group. Mother fertility shares of TFR: 15–19 4% · 20–24 18% · 25–29 28% · 30–34 26% · 35–39 16% · 40–44 7% · 45–49 1%.</p>

<h3>3. Years</h3>
<p>
  For each country the start year defaults to the <strong>freshest input year</strong>
  (e.g. BirthGauge TFR 2026). If the age–sex snapshot is older (2024), the engine
  steps that snapshot forward with year-specific TFR / e0 / migration until the start year.
</p>
<p>
  The pyramid cannot start before the age–sex snapshot year (usually 2024).
  Country graphs can still plot UN WPP indicators from 1950.
  Playback loops when it reaches the end year. Space starts and stops it.
</p>
<p>
  If <strong>Drive simulation with WPP Medium rates</strong> is on, TFR, life expectancy, and net migration
  for each calendar year are taken from the UN WPP 2024 Medium series when a point exists;
  otherwise from the country’s observed series. The age–sex bars are still this app’s cohort model,
  not WPP’s official age structure.
</p>

<h3>4. Triangle view</h3>
<p>
  An equilateral triangle: each side is the <strong>value (X) axis</strong> of a pyramid.
  The age (Y) axis is <strong>perpendicular</strong> to that side, through the midpoint.
  Left side = population (northwest). Right side = mortality (northeast).
  Bottom = fertility (south–north, hanging south of the base). Youngest group sits on the triangle edge.
  Clicking a year on the strip stops playback and freezes that year.
</p>

<h3>5. Map colors</h3>
<p>
  Default coloring (TFR and most metrics) is <strong>diverging around the mean of the active metric</strong>:
  red below, white near the average, blue above (3-color palette).
  You can switch to a 2-color low/high blend, sequential min→max, or TFR versus replacement 2.1.
  Dual mode fills by population share.
</p>
<p>
  <strong>Absolute population</strong> is an exception: it uses a <strong>log</strong> scale from smallest to largest,
  so there is no white “average” country.
</p>
<p>
  You can override the pivot (median, population-weighted mean, another metric, or a custom number).
</p>
<p>
  <strong>Fertility gap</strong> = estimated TFR − mean ideal number of children of reproductive-age women.
  Negative means a country is undershooting stated ideals.
  The map checkbox can average every available ideal survey instead of only the newest.
</p>
<p>
  Hovering a country on the world map shows a mini-pyramid at the <strong>same year</strong> as the simulation.
  Pause on the map pauses that pyramid too.
  The <strong>USA</strong> tab is the same interaction on a flat Albers map of states (no globe): hover pyramids, pins, heatmap, year strip, and the state’s own BirthGauge TFR.
</p>

<h3>6. What this is not</h3>
<p>
  An exploratory teaching model — <strong>not</strong> an official UN or national statistical office forecast.
</p>

<h3>Data sources</h3>
<p>
  United Nations, Department of Economic and Social Affairs, Population Division (2024).
  <em>World Population Prospects 2024</em>. Licensed under CC BY 3.0 IGO.
</p>
<p>
  Indicator time series (TFR, life expectancy, population, net migration, births) and the optional
  Medium-variant overlay come from WPP 2024 file <strong>GEN/01</strong>.
  GEN/01 does not contain full age–sex pyramids, so the animated bars are this app’s cohort-component model
  on top of a 2024 five-year extract (PopulationPyramid.net / WPP-derived).
</p>
<ul class="help-list">
  <li><strong>UN World Population Prospects 2024</strong> (CC BY 3.0 IGO) — GEN/01 indicators and the age–sex base. <em>population.un.org/wpp</em></li>
  <li><strong>BirthGauge / national statistical offices</strong> — 2015–2026 TFR file in the repo (recent years overlay WPP).</li>
  <li><strong>BirthGauge US states 2025</strong> — TFR, TMR (first-birth TFR / share of women becoming mothers), and CPM (children per mother) for the 50 states and DC. The USA map uses these TFR values in the pyramid simulation.</li>
  <li><strong>U.S. Census Bureau Vintage 2025</strong> — July 1, 2025 state population estimates. Each state’s age–sex bars start from the United States WPP pyramid, scaled by that state’s share of the US total.</li>
  <li><strong>DHS STATcompiler</strong> indicator <code>PR_IDLC_W_MNA</code> — mean ideal number of children, women 15–49.</li>
  <li><strong>Eurobarometer / OECD Family Database / GGS</strong> published means for high-income countries DHS does not cover.</li>
  <li><strong>OECD International Migration Database</strong> — optional gross <em>inflows</em> on the country graphs for a subset of countries. Not used as map net migration.</li>
</ul>
<p>
  The comprehensive World Fertility Ideals / FSD4032 file (Stone, Golovina, Bastianelli, 1936–2025) cannot be redistributed here (research license).
  Paste those values in <strong>Database</strong> if you have access.
</p>
<p class="help-footnote">
  Made by <strong>Marko Njegomir</strong> with Grok. Projection is a simplified cohort-component model for exploration.
</p>
`;

export const HELP_HTML = HELP_HTML_EN;

export const HELP_HTML_SR = `
<p class="help-lead">
  Ова апликација користи упрошћени <strong>когортно-компонентни</strong> модел.
  Видите <strong>петогодишње старосне траке</strong>, али машина стари људе по
  <strong>појединачним годинама живота</strong> (0, 1, 2, …), па их затим групише за графикон.
</p>

<h3>1. Почетак: проширење петогодишњих података на једногодишње</h3>
<p>
  Основни старосно-полни бројеви су <strong>петогодишњи извод из 2024</strong> из
  <strong>УН Светских изгледа становништва 2024</strong>
  (преко PopulationPyramid.net када директан извод није упакован).
  Свака група као 0–4 дели се на пет једнаких једногодишњих узраста на почетку тока.
  Група 100+ остаје једна трака.
</p>

<h3>2. Свака симулирана година (редом)</h3>
<ol class="help-steps">
  <li><strong>Смрти</strong> — свака једногодишња старост множи се стопом преживљавања из <em>упрошћене</em> старосне шеме, скалиране очекиваним трајањем живота (није званична УН таблица). Те смрти пуне <em>пирамиду морталитета</em>.</li>
  <li><strong>Рођења</strong> — жене 15–49 рађају по ССФ и фиксном старосном обрасцу фертилитета. Рођења по узрасту мајке пуне <em>пирамиду фертилитета</em> (дечаци и девојчице по односу полова на рођењу).</li>
  <li><strong>Старост +1 година</strong> — сви се померају за једну годину. Узраст 99 улази у групу 100+.</li>
  <li><strong>Миграција</strong> — опциона. Ако је поље миграције <em>Користи</em> искључено (подразумевано), симулација додаје <strong>нула</strong> нето миграната. Ако је укључено, људи се додају или одузимају са врхунцем око 28 година. Топлотне карте миграција и даље читају УН WPP чак и када симулација користи нулу.</li>
  <li><strong>Приказ</strong> — једногодишњи узрасти сабирају се назад у 0–4, 5–9, … 100+ за пирамиде.</li>
</ol>

<pre class="help-formula">births_g = women_g × (TFR × share_g) / 5</pre>
<p>Дељење са 5 претвара животни ССФ у једногодишњи ток за петогодишњу групу. Удели фертилитета мајки у ССФ: 15–19 4% · 20–24 18% · 25–29 28% · 30–34 26% · 35–39 16% · 40–44 7% · 45–49 1%.</p>

<h3>3. Године</h3>
<p>
  За сваку земљу почетна година подразумевано је <strong>најсвежија година уноса</strong>
  (нпр. BirthGauge ССФ 2026). Ако је старосни снимак старији (2024), машина
  помера тај снимак напред са годишњим ССФ / e0 / миграцијом до почетне године.
</p>
<p>
  Пирамида не може да почне пре године старосног снимка (обично 2024).
  Графикони земље и даље могу да цртају УН WPP показатеље од 1950.
  Пуштање се враћа на почетак када стигне до крајње године. Размак покреће и зауставља.
</p>
<p>
  Ако је укључено <strong>Води симулацију WPP Medium стопама</strong>, ССФ, очекивано трајање живота и нето миграција
  за сваку календарску годину узимају се из УН WPP 2024 Medium када тачка постоји;
  иначе из опажене серије земље. Старосне траке су и даље когортни модел ове апликације,
  не званична WPP старосна структура.
</p>

<h3>4. Приказ троугла</h3>
<p>
  Једнакостранични троугао: свака страница је <strong>оса вредности (X)</strong> пирамиде.
  Оса старости (Y) је <strong>управна</strong> на ту страницу, кроз средину.
  Лева страница = становништво (северозапад). Десна = морталитет (североисток).
  Доња = фертилитет (југ–север, виси јужно од основе). Најмлађа група седи на ивици троугла.
  Клик на годину на траци зауставља пуштање и замрзава ту годину.
</p>

<h3>5. Боје на карти</h3>
<p>
  Подразумевано бојење (ССФ и већина мера) је <strong>дивергентно око средње вредности активне мере</strong>:
  црвено испод, бело око просека, плаво изнад (палета са 3 боје).
  Можете прећи на стапање 2 боје ниско/високо, секвенцијално мин→макс, или ССФ наспрам замене 2,1.
  Дуал режим попуњава уделом становништва.
</p>
<p>
  <strong>Апсолутно становништво</strong> је изузетак: користи <strong>лог</strong> скалу од најмањег ка највећем,
  па нема беле „просечне“ земље.
</p>
<p>
  Стожер можете променити (медијана, пондерисана средња, друга мера, или произвољан број).
</p>
<p>
  <strong>Јаз фертилитета</strong> = процењени ССФ − средњи идеални број деце жена у репродуктивном добу.
  Негативно значи да земља заостаје за изреченим идеалима.
  Поље на карти може да усредњи све доступне анкете идеала уместо само најновије.
</p>
<p>
  Прелазак преко земље на светској карти приказује мини-пирамиду у <strong>истој години</strong> као симулација.
  Пауза на карти паузира и ту пирамиду.
  Језичак <strong>САД</strong> је иста интеракција на равној Алберсовој карти држава (без глобуса): пирамиде на преласку, чиоде, топлотна карта, трака година и ССФ те државе из BirthGauge.
</p>

<h3>6. Шта ово није</h3>
<p>
  Истраживачки наставни модел — <strong>није</strong> званична пројекција УН или националног завода.
</p>

<h3>Извори података</h3>
<p>
  United Nations, Department of Economic and Social Affairs, Population Division (2024).
  <em>World Population Prospects 2024</em>. Лиценца CC BY 3.0 IGO.
</p>
<p>
  Временске серије показатеља (ССФ, очекивано трајање живота, становништво, нето миграција, рођења) и опциони
  Medium слој долазе из WPP 2024 датотеке <strong>GEN/01</strong>.
  GEN/01 не садржи пуне старосно-полне пирамиде, па су анимиране траке когортно-компонентни модел ове апликације
  над петогодишњим изводом из 2024 (PopulationPyramid.net / извод из WPP).
</p>
<ul class="help-list">
  <li><strong>УН Светски изгледи становништва 2024</strong> (CC BY 3.0 IGO) — GEN/01 показатељи и старосно-полна основа. <em>population.un.org/wpp</em></li>
  <li><strong>BirthGauge / национални заводи</strong> — датотека ССФ 2015–2026 у репозиторијуму (скорије године прекривају WPP).</li>
  <li><strong>BirthGauge америчке државе 2025</strong> — ССФ, СМР (ССФ првог детета / удео жена које постану мајке) и ДПМ (деце по мајци) за 50 држава и DC. Карта САД користи те ССФ вредности у симулацији пирамиде.</li>
  <li><strong>U.S. Census Bureau Vintage 2025</strong> — процене становништва држава на 1. јул 2025. Старосне траке сваке државе полазе од WPP пирамиде САД, скалиране уделом те државе у укупном становништву.</li>
  <li><strong>DHS STATcompiler</strong> показатељ <code>PR_IDLC_W_MNA</code> — средњи идеални број деце, жене 15–49.</li>
  <li><strong>Eurobarometer / OECD Family Database / GGS</strong> објављени просеци за земље високог дохотка које DHS не покрива.</li>
  <li><strong>OECD база међународних миграција</strong> — опциони бруто <em>приливи</em> на графиконима за подскуп земаља. Не користи се као нето миграција на карти.</li>
</ul>
<p>
  Свеобухватни досије World Fertility Ideals / FSD4032 (Stone, Golovina, Bastianelli, 1936–2025) овде се не може делити (истраживачка лиценца).
  Налепите те вредности у <strong>Базу</strong> ако имате приступ.
</p>
<p class="help-footnote">
  Направио <strong>Марко Његомир</strong> уз Grok. Пројекција је упрошћени когортно-компонентни модел за истраживање.
</p>
`;

export function getHelpHtml(locale: string) {
  return locale === "sr" ? HELP_HTML_SR : HELP_HTML_EN;
}


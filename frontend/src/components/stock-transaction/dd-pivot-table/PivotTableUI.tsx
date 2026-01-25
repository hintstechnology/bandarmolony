import React from 'react';
import PropTypes from 'prop-types';
import update from 'immutability-helper';
import { PivotData, getSort, sortAs } from './Utilities';
import PivotTable from './PivotTable';
import Sortable from 'react-sortablejs';
import Draggable from 'react-draggable';
import { Loader2 } from 'lucide-react';

// Helper to unwrap ESM modules or other object wrappers
const normalize = (obj: any) => {
    if (!obj) return obj;
    if (obj.__esModule && obj.default) return obj.default;
    if (typeof obj === 'object' && obj.default && (typeof obj.default === 'function' || (typeof obj.default === 'object' && obj.default.render))) {
        return obj.default;
    }
    return obj;
};

const SortableComponent = normalize(Sortable);
const DraggableComponent = normalize(Draggable);
const PivotTableComponent = normalize(PivotTable);

interface DraggableAttributeProps {
    name: string;
    addValuesToFilter: (attr: string, values: any[]) => void;
    removeValuesFromFilter: (attr: string, values: any[]) => void;
    setValuesInFilter: (attr: string, values: any[]) => void;
    attrValues: Record<string, number>;
    valueFilter: Record<string, boolean>;
    moveFilterBoxToTop: (attr: string) => void;
    sorter: (a: any, b: any) => number;
    menuLimit?: number;
    zIndex?: number;
    groupByHour?: boolean;
    toggleGroupByHour?: (val: boolean) => void;
}

interface DraggableAttributeState {
    open: boolean;
    filterText: string;
    displayLimit: number;
}

export class DraggableAttribute extends React.Component<DraggableAttributeProps, DraggableAttributeState> {
    filterBoxRef: React.RefObject<HTMLDivElement>;

    constructor(props: DraggableAttributeProps) {
        super(props);
        this.state = {
            open: false,
            filterText: '',
            displayLimit: 10,
        };
        this.filterBoxRef = React.createRef();
        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    override componentDidMount() {
        document.addEventListener('mousedown', this.handleClickOutside);
    }

    override componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
    }

    handleClickOutside(event: MouseEvent) {
        if (
            this.state.open &&
            this.filterBoxRef.current &&
            !this.filterBoxRef.current.contains(event.target as Node)
        ) {
            const attrButton = (event.target as HTMLElement).closest('.pvtAttr');
            const isOurButton = attrButton && attrButton.parentElement?.getAttribute('data-id') === this.props.name;

            if (!isOurButton) {
                this.setState({ open: false });
            }
        }
    }

    getHour(time: any): string {
        const s = String(time);
        if (s.length === 5 && s.endsWith(':00')) return s;
        if (s.includes(':')) return s.split(':')[0] + ':00';
        const t = s.padStart(6, '0');
        return t.substring(0, 2) + ':00';
    }

    getFullTime(time: any): string {
        const s = String(time);
        if (s.includes(':')) return s;
        const t = s.padStart(6, '0');
        return `${t.substring(0, 2)}:${t.substring(2, 4)}:${t.substring(4, 6)}`;
    }

    toggleHour(hour: string, e: React.MouseEvent) {
        e.stopPropagation();
        const values = Object.keys(this.props.attrValues);
        const valuesInHour = values.filter(v => this.getHour(v) === hour);
        const allSelected = valuesInHour.every(v => !(v in this.props.valueFilter));

        if (allSelected) {
            this.props.addValuesToFilter(this.props.name, valuesInHour);
        } else {
            this.props.removeValuesFromFilter(this.props.name, valuesInHour);
        }
    }

    toggleValue(value: any) {
        if (value in this.props.valueFilter) {
            this.props.removeValuesFromFilter(this.props.name, [value]);
        } else {
            this.props.addValuesToFilter(this.props.name, [value]);
        }
    }

    matchesFilter(x: string) {
        return x
            .toLowerCase()
            .trim()
            .includes(this.state.filterText.toLowerCase().trim());
    }

    selectOnly(e: any, value: any) {
        e.stopPropagation();
        this.props.setValuesInFilter(
            this.props.name,
            Object.keys(this.props.attrValues).filter(y => y !== value)
        );
    }

    getFilterBox() {
        const isTrxTime = this.props.name === 'TRX_TIME';
        const values = Object.keys(this.props.attrValues);

        const shown = values
            .filter(this.matchesFilter.bind(this))
            .sort(this.props.sorter);

        let groupedShown: string[] = [];
        if (isTrxTime && this.props.groupByHour) {
            const hours = new Set<string>();
            shown.forEach(v => hours.add(this.getHour(v)));
            groupedShown = Array.from(hours).sort();
        }

        return (
            <DraggableComponent handle=".pvtDragHandle">
                <div
                    className="pvtFilterBox"
                    ref={this.filterBoxRef}
                    style={{
                        display: 'block',
                        cursor: 'initial',
                        zIndex: this.props.zIndex,
                    }}
                    onClick={() => this.props.moveFilterBoxToTop(this.props.name)}
                >
                    <a
                        onClick={() => this.setState({ open: false })}
                        className="pvtCloseX"
                    >
                        ×
                    </a>
                    <span className="pvtDragHandle">☰</span>
                    <h4>{this.props.name}</h4>

                    <p>
                        <input
                            type="text"
                            placeholder="Filter values"
                            className="pvtSearch"
                            value={this.state.filterText}
                            onChange={e =>
                                this.setState({
                                    filterText: e.target.value,
                                    displayLimit: 10,
                                })
                            }
                        />
                        <br />
                        {isTrxTime && (
                            <label className="flex items-center gap-2 mb-2 cursor-pointer text-xs text-blue-400 hover:text-blue-300">
                                <input
                                    type="checkbox"
                                    checked={this.props.groupByHour}
                                    onChange={e => {
                                        this.props.toggleGroupByHour?.(e.target.checked);
                                        this.setState({ displayLimit: 10 });
                                    }}
                                    className="w-3 h-3"
                                />
                                Group by Hour
                            </label>
                        )}
                        <a
                            role="button"
                            className="pvtButton"
                            onClick={() =>
                                this.props.removeValuesFromFilter(
                                    this.props.name,
                                    Object.keys(this.props.attrValues).filter(
                                        this.matchesFilter.bind(this)
                                    )
                                )
                            }
                        >
                            Select {this.props.groupByHour ? groupedShown.length : shown.length}
                        </a>{' '}
                        <a
                            role="button"
                            className="pvtButton"
                            onClick={() =>
                                this.props.addValuesToFilter(
                                    this.props.name,
                                    Object.keys(this.props.attrValues).filter(
                                        this.matchesFilter.bind(this)
                                    )
                                )
                            }
                        >
                            Deselect {this.props.groupByHour ? groupedShown.length : shown.length}
                        </a>
                    </p>

                    <div
                        className="pvtCheckContainer"
                        onScroll={e => {
                            const container = e.target as HTMLDivElement;
                            if (
                                container.scrollHeight - container.scrollTop - container.clientHeight <
                                50
                            ) {
                                const list = this.props.groupByHour ? groupedShown : shown;
                                if (this.state.displayLimit < list.length) {
                                    this.setState({
                                        displayLimit: this.state.displayLimit + 10,
                                    });
                                }
                            }
                        }}
                    >
                        {this.props.groupByHour ? (
                            groupedShown.slice(0, this.state.displayLimit).map(hour => {
                                const valuesInHour = values.filter(v => this.getHour(v) === hour);
                                const someSelected = valuesInHour.some(v => !(v in this.props.valueFilter));
                                const allSelected = valuesInHour.every(v => !(v in this.props.valueFilter));

                                return (
                                    <p
                                        key={hour}
                                        onClick={(e) => this.toggleHour(hour, e)}
                                        className={allSelected ? 'selected' : (someSelected ? 'partial-selected' : '')}
                                        style={{ fontWeight: 'bold' }}
                                    >
                                        <a className="pvtOnlySpacer">&nbsp;</a>
                                        {hour}
                                    </p>
                                );
                            })
                        ) : (
                            shown.slice(0, this.state.displayLimit).map(x => (
                                <p
                                    key={x}
                                    onClick={() => this.toggleValue(x)}
                                    className={x in this.props.valueFilter ? '' : 'selected'}
                                >
                                    <a className="pvtOnly" onClick={e => this.selectOnly(e, x)}>
                                        only
                                    </a>
                                    <a className="pvtOnlySpacer">&nbsp;</a>
                                    {x === '' ? <em>null</em> : (isTrxTime ? this.getFullTime(x) : x)}
                                </p>
                            ))
                        )}
                    </div>
                </div>
            </DraggableComponent>
        );
    }

    toggleFilterBox() {
        this.setState({ open: !this.state.open });
        this.props.moveFilterBoxToTop(this.props.name);
    }

    override render() {
        const filtered =
            Object.keys(this.props.valueFilter).length !== 0
                ? 'pvtFilteredAttribute'
                : '';
        return (
            <li data-id={this.props.name}>
                <span
                    className={'pvtAttr ' + filtered}
                    onClick={this.toggleFilterBox.bind(this)}
                >
                    {this.props.name}
                    <span className="pvtTriangle">▾</span>
                </span>
                {this.state.open ? this.getFilterBox() : null}
            </li>
        );
    }
}

interface DropdownProps {
    zIndex?: number;
    toggle: () => void;
    open: boolean;
    current?: string;
    values: string[];
    setValue: (val: string) => void;
}

export class Dropdown extends React.PureComponent<DropdownProps> {
    override render() {
        return (
            <div className="pvtDropdown" style={{ zIndex: this.props.zIndex }}>
                <div
                    onClick={e => {
                        e.stopPropagation();
                        this.props.toggle();
                    }}
                    className={
                        'pvtDropdownValue pvtDropdownCurrent ' +
                        (this.props.open ? 'pvtDropdownCurrentOpen' : '')
                    }
                    role="button"
                >
                    <div className="pvtDropdownIcon">{this.props.open ? '×' : '▾'}</div>
                    {this.props.current || <span>&nbsp;</span>}
                </div>
                {this.props.open && (
                    <div className="pvtDropdownMenu">
                        {this.props.values.map((r: any) => (
                            <div
                                key={r}
                                role="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    if (this.props.current === r) {
                                        this.props.toggle();
                                    } else {
                                        this.props.setValue(r);
                                    }
                                }}
                                className={
                                    'pvtDropdownValue ' +
                                    (r === this.props.current ? 'pvtDropdownActiveValue' : '')
                                }
                            >
                                {r}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }
}

interface PivotTableUIProps {
    data: any;
    onChange: (state: any) => void;
    renderers?: Record<string, any>;
    aggregators?: Record<string, any>;
    aggregatorName?: string;
    rendererName?: string;
    vals: string[];
    cols: string[];
    rows: string[];
    valueFilter: Record<string, Record<string, boolean>>;
    sorters?: any;
    derivedAttributes?: Record<string, (record: any) => any>;
    rowOrder?: string;
    colOrder?: string;
    hiddenAttributes?: string[];
    hiddenFromDragDrop?: string[];
    hiddenFromAggregators?: string[];
    menuLimit?: number;
    unusedOrientationCutoff?: number;
    [key: string]: any;
}

interface PivotTableUIState {
    unusedOrder: string[];
    zIndices: Record<string, number>;
    maxZIndex: number;
    openDropdown: string | false;
    attrValues: Record<string, Record<string, number>>;
    materializedInput: any[];
    groupByHour: boolean;
    isProcessing: boolean;
}

class PivotTableUI extends React.PureComponent<PivotTableUIProps, PivotTableUIState> {
    static defaultProps = Object.assign({}, PivotData.defaultProps, {
        hiddenAttributes: [],
        hiddenFromDragDrop: [],
        hiddenFromAggregators: [],
        onDragDrop: () => { },
    });

    constructor(props: PivotTableUIProps) {
        super(props);
        this.state = {
            unusedOrder: [],
            zIndices: {},
            maxZIndex: 500,
            openDropdown: false,
            attrValues: {},
            materializedInput: [],
            groupByHour: true,
            isProcessing: false,
        };
        this.handleClickOutside = this.handleClickOutside.bind(this);
    }

    override componentDidMount() {
        this.materializeInput(this.props);
        document.addEventListener('mousedown', this.handleClickOutside);
    }

    override componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickOutside);
    }

    handleClickOutside(event: MouseEvent) {
        if (this.state.openDropdown) {
            const target = event.target as HTMLElement;
            const isInsideDropdown = target.closest('.pvtDropdown');
            if (!isInsideDropdown) {
                this.setState({ openDropdown: false });
            }
        }
    }

    override componentDidUpdate(prevProps: PivotTableUIProps, prevState: PivotTableUIState) {
        if (prevProps.data !== this.props.data || prevState.groupByHour !== this.state.groupByHour) {
            this.materializeInput(this.props);
        }
    }

    materializeInput(props: PivotTableUIProps) {
        const { data, derivedAttributes: rawDerived } = props;
        const derivedAttributes = rawDerived || {};

        const newState: any = {
            data,
            attrValues: {},
            materializedInput: [],
        };

        const skipIndexing = new Set([
            ...(this.props.hiddenAttributes || []),
            ...(this.props.hiddenFromDragDrop || []),
            ...(this.props.hiddenFromAggregators || [])
        ]);

        let recordsProcessed = 0;
        PivotData.forEachRecord(
            newState.data,
            {},
            (rawRecord: any) => {
                const record = { ...rawRecord };
                for (const k in derivedAttributes) {
                    const derived = derivedAttributes[k](record);
                    if (derived !== null) {
                        record[k] = derived;
                    }
                }

                if (this.state.groupByHour && record['TRX_TIME'] !== undefined) {
                    const time = record['TRX_TIME'];
                    if (time !== null) {
                        const t = String(time).padStart(6, '0');
                        record['TRX_TIME'] = t.substring(0, 2) + ':00';
                    }
                }

                newState.materializedInput.push(record);
                for (const attr of Object.keys(record)) {
                    if (skipIndexing.has(attr)) continue;

                    if (!(attr in newState.attrValues)) {
                        newState.attrValues[attr] = {};
                        if (recordsProcessed > 0) {
                            newState.attrValues[attr].null = recordsProcessed;
                        }
                    }

                    const value = record[attr] ?? 'null';
                    if (!(value in newState.attrValues[attr])) {
                        newState.attrValues[attr][value] = 0;
                    }
                    newState.attrValues[attr][value]++;
                }
                recordsProcessed++;
            }
        );
        this.setState(newState);
    }

    sendPropUpdate(command: any) {
        this.setState({ isProcessing: true }, () => {
            setTimeout(() => {
                this.props.onChange(update(this.props, command));
                this.setState({ isProcessing: false });
            }, 50);
        });
    }

    propUpdater(key: string) {
        return (value: any) => this.sendPropUpdate({ [key]: { $set: value } });
    }

    setValuesInFilter(attribute: string, values: any[]) {
        this.sendPropUpdate({
            valueFilter: {
                [attribute]: {
                    $set: values.reduce((r, v) => {
                        r[v] = true;
                        return r;
                    }, {}),
                },
            },
        });
    }

    addValuesToFilter(attribute: string, values: any[]) {
        if (attribute in this.props.valueFilter) {
            this.sendPropUpdate({
                valueFilter: {
                    [attribute]: values.reduce((r, v) => {
                        r[v] = { $set: true };
                        return r;
                    }, {}),
                },
            });
        } else {
            this.setValuesInFilter(attribute, values);
        }
    }

    removeValuesFromFilter(attribute: string, values: any[]) {
        this.sendPropUpdate({
            valueFilter: { [attribute]: { $unset: values } },
        });
    }

    moveFilterBoxToTop(attribute: string) {
        this.setState(
            update(this.state, {
                maxZIndex: { $set: this.state.maxZIndex + 1 },
                zIndices: { [attribute]: { $set: this.state.maxZIndex + 1 } },
            })
        );
    }

    isOpen(dropdown: any) {
        return this.state.openDropdown === dropdown;
    }

    makeDnDCell(items: any[], onChange: any, classes: string) {
        return (
            <SortableComponent
                options={{
                    group: 'shared',
                    ghostClass: 'pvtPlaceholder',
                    filter: '.pvtFilterBox',
                    preventOnFilter: false,
                }}
                tag="td"
                className={classes}
                onChange={onChange}
            >
                {items.map(x => (
                    <DraggableAttribute
                        name={x}
                        key={x}
                        attrValues={this.state.attrValues[x] || {}}
                        valueFilter={this.props.valueFilter[x] || {}}
                        sorter={getSort(this.props.sorters, x)}
                        menuLimit={this.props.menuLimit}
                        setValuesInFilter={this.setValuesInFilter.bind(this)}
                        addValuesToFilter={this.addValuesToFilter.bind(this)}
                        moveFilterBoxToTop={this.moveFilterBoxToTop.bind(this)}
                        removeValuesFromFilter={this.removeValuesFromFilter.bind(this)}
                        zIndex={this.state.zIndices[x] || this.state.maxZIndex}
                        groupByHour={x === 'TRX_TIME' ? this.state.groupByHour : false}
                        toggleGroupByHour={(val: boolean) => {
                            this.setState({ isProcessing: true }, () => {
                                setTimeout(() => {
                                    this.setState({ groupByHour: val, isProcessing: false });
                                }, 50);
                            });
                        }}
                    />
                ))}
            </SortableComponent>
        );
    }

    override render() {
        const rawRenderers = this.props.renderers || PivotData.defaultProps.renderers;
        const rawAggregators = this.props.aggregators || PivotData.defaultProps.aggregators;

        const renderers = (normalize(rawRenderers) || {}) as Record<string, any>;
        const aggregators = (normalize(rawAggregators) || {}) as Record<string, any>;

        const aggregatorName =
            this.props.aggregatorName || PivotData.defaultProps.aggregatorName;
        const rendererName =
            this.props.rendererName || PivotData.defaultProps.rendererName;

        const rendererCell = (
            <td className="pvtRenderers" style={{ zIndex: this.isOpen('renderer') ? 2001 : 1, position: 'relative' }}>
                <Dropdown
                    current={rendererName}
                    values={Object.keys(renderers).filter(k => k !== 'default')}
                    open={this.isOpen('renderer')}
                    zIndex={this.state.maxZIndex + 1}
                    toggle={() =>
                        this.setState({
                            openDropdown: this.isOpen('renderer') ? false : 'renderer',
                        })
                    }
                    setValue={this.propUpdater('rendererName')}
                />
            </td>
        );

        const aggregatorCell = (
            <td className="pvtVals" style={{ zIndex: (this.isOpen('aggregator') || this.props.vals.some((x: any) => this.isOpen(`val${x}`))) ? 2001 : 1, position: 'relative' }}>
                <Dropdown
                    current={aggregatorName}
                    values={Object.keys(aggregators).filter(k => k !== 'default')}
                    open={this.isOpen('aggregator')}
                    zIndex={this.state.maxZIndex + 1}
                    toggle={() =>
                        this.setState({
                            openDropdown: this.isOpen('aggregator') ? false : 'aggregator',
                        })
                    }
                    setValue={this.propUpdater('aggregatorName')}
                />
                <br />
                {this.props.vals.map(x => (
                    <Dropdown
                        key={x}
                        current={x}
                        values={Object.keys(this.state.attrValues)}
                        open={this.isOpen(`val${x}`)}
                        zIndex={this.state.maxZIndex + 1}
                        toggle={() =>
                            this.setState({
                                openDropdown: this.isOpen(`val${x}`) ? false : `val${x}`,
                            })
                        }
                        setValue={value =>
                            this.sendPropUpdate({
                                vals: { $splice: [[this.props.vals.indexOf(x), 1, value]] },
                            })
                        }
                    />
                ))}
            </td>
        );

        const unusedAttrsCell = this.makeDnDCell(
            Object.keys(this.state.attrValues)
                .filter(
                    x =>
                        !this.props.rows.includes(x) &&
                        !this.props.cols.includes(x) &&
                        !this.props.hiddenAttributes.includes(x) &&
                        !this.props.hiddenFromDragDrop.includes(x)
                )
                .sort(sortAs(this.state.unusedOrder)),
            (order: any) => this.setState({ unusedOrder: order }),
            'pvtAxisContainer pvtHorizList pvtUnused'
        );

        const colAttrsCell = this.makeDnDCell(
            this.props.cols,
            (order: any) => this.sendPropUpdate({
                cols: { $set: order },
                rows: { $set: this.props.rows.filter((x: any) => !order.includes(x)) }
            }),
            'pvtAxisContainer pvtHorizList pvtCols'
        );

        const rowAttrsCell = this.makeDnDCell(
            this.props.rows,
            (order: any) => this.sendPropUpdate({
                rows: { $set: order },
                cols: { $set: this.props.cols.filter((x: any) => !order.includes(x)) }
            }),
            'pvtAxisContainer pvtRows'
        );

        const outputCell = (
            <td className="pvtOutput" style={{ position: 'relative', width: '100%', height: '100%' }}>
                {this.state.isProcessing && (
                    <div className="absolute inset-0 z-[4000] flex items-center justify-center bg-[#0a0f20]/60 backdrop-blur-[2px] transition-all">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <span className="text-sm font-medium text-white/80">Recalculating...</span>
                        </div>
                    </div>
                )}
                <div style={{ overflow: 'hidden', width: '100%', height: '100%', opacity: this.state.isProcessing ? 0.5 : 1 }}>
                    <PivotTableComponent
                        {...update(this.props, {
                            data: { $set: this.state.materializedInput },
                            derivedAttributes: { $set: {} },
                            renderers: { $set: renderers },
                            aggregators: { $set: aggregators }
                        })}
                    />
                </div>
            </td>
        );

        return (
            <table className="pvtUi">
                <thead>
                    <tr>
                        {rendererCell}
                        {unusedAttrsCell}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {aggregatorCell}
                        {colAttrsCell}
                    </tr>
                    <tr>
                        {rowAttrsCell}
                        {outputCell}
                    </tr>
                </tbody>
            </table>
        );
    }
}

(PivotTableUI as any).propTypes = Object.assign({}, PivotData.propTypes, {
    onChange: PropTypes.func.isRequired,
    hiddenAttributes: PropTypes.arrayOf(PropTypes.string),
    hiddenFromDragDrop: PropTypes.arrayOf(PropTypes.string),
    hiddenFromAggregators: PropTypes.arrayOf(PropTypes.string),
    onDragDrop: PropTypes.func,
});

export default PivotTableUI;

import React from 'react';
import { X, Info, GripVertical, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { PivotConfig, DoneDetailData } from './StockTransactionDoneDetail';

interface StockTransactionDoneDetailCustomizeFieldsProps {
    isPivotBuilderOpen: boolean;
    setIsPivotBuilderOpen: (isOpen: boolean) => void;
    availableFields: Array<{ id: string; label: string; type: string }>;
    tempPivotConfig: PivotConfig;
    setTempPivotConfig: React.Dispatch<React.SetStateAction<PivotConfig>>;
    draggedField: string | null;
    setDraggedField: React.Dispatch<React.SetStateAction<string | null>>;
    draggedFromSource: 'available' | 'rows' | 'columns' | 'filters' | null;
    setDraggedFromSource: React.Dispatch<React.SetStateAction<'available' | 'rows' | 'columns' | 'filters' | null>>;
    draggedIndex: number | null;
    setDraggedIndex: React.Dispatch<React.SetStateAction<number | null>>;
    touchDragState: {
        isDragging: boolean;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    } | null;
    setTouchDragState: React.Dispatch<React.SetStateAction<{
        isDragging: boolean;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    } | null>>;
    dropZoneHighlight: 'rows' | 'columns' | 'filters' | 'available' | null;
    handleDropTemp: (
        fieldId: string,
        source: 'available' | 'rows' | 'columns' | 'filters',
        sourceIndex: number | null,
        targetZone: 'rows' | 'columns' | 'filters' | 'available' | null
    ) => void;
    tempFilterSearchTerms: { [key: string]: string };
    setTempFilterSearchTerms: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
    tempOpenFilterDropdowns: { [key: string]: boolean };
    setTempOpenFilterDropdowns: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
    doneDetailData: Map<string, DoneDetailData[]>;
    selectedDates: string[];
    setPivotConfig: React.Dispatch<React.SetStateAction<PivotConfig>>;
    setFilterSearchTerms: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
    setOpenFilterDropdowns: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
}

export const StockTransactionDoneDetailCustomizeFields: React.FC<StockTransactionDoneDetailCustomizeFieldsProps> = ({
    isPivotBuilderOpen,
    setIsPivotBuilderOpen,
    availableFields,
    tempPivotConfig,
    setTempPivotConfig,
    draggedField,
    setDraggedField,
    draggedFromSource,
    setDraggedFromSource,
    draggedIndex,
    setDraggedIndex,
    touchDragState,
    setTouchDragState,
    dropZoneHighlight,
    handleDropTemp,
    tempFilterSearchTerms,
    setTempFilterSearchTerms,
    tempOpenFilterDropdowns,
    setTempOpenFilterDropdowns,
    doneDetailData,
    selectedDates,
    setPivotConfig,
    setFilterSearchTerms,
    setOpenFilterDropdowns
}) => {
    // Auto-apply changes whenever temp configuration changes
    React.useEffect(() => {
        const timeoutId = setTimeout(() => {
            setPivotConfig(tempPivotConfig);
            setFilterSearchTerms(tempFilterSearchTerms);
            setOpenFilterDropdowns(tempOpenFilterDropdowns);
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [tempPivotConfig, tempFilterSearchTerms, tempOpenFilterDropdowns, setPivotConfig, setFilterSearchTerms, setOpenFilterDropdowns]);

    return (
        <div
            className={`fixed top-14 right-0 h-[calc(100vh-3.5rem)] w-full sm:w-[400px] md:w-[450px] bg-[#0a0f20] border-l border-border shadow-2xl z-40 transition-transform duration-300 ease-in-out flex flex-col overflow-x-hidden ${isPivotBuilderOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
        >
            {/* Header - Aligned with control panel */}
            <div className="flex-shrink-0 bg-[#0a0f20] border-b border-[#3a4252] px-4 h-[45px] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">Customize Pivot Table Fields</h2>
                    <div className="relative group">
                        <Info className="w-4 h-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                        <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                            <div className="text-xs font-semibold text-popover-foreground mb-2">💡 Contoh Penggunaan:</div>
                            <div className="text-xs text-muted-foreground space-y-1">
                                <div><strong>Rows:</strong> Price → Setiap baris = harga yang berbeda</div>
                                <div><strong>Values:</strong> Volume (SUM) → Jumlah total volume per harga</div>
                                <div><strong>Filters:</strong> Buyer Broker = &quot;YP&quot; → Hanya hitung transaksi dari buyer broker YP</div>
                                <div className="mt-2 text-foreground">Hasil: Tabel dengan kolom Price dan Sum Volume, hanya untuk buyer broker YP</div>
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setIsPivotBuilderOpen(false)}
                    className="p-1 hover:bg-accent rounded-md transition-colors"
                    aria-label="Close panel"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[#0a0f20]">
                <div className="py-3">
                    {/* Drag and Drop Pivot Builder Section */}
                    <div className="px-3 py-2 border-b border-[#3a4252] bg-[#0a0f20]">
                        <div className="flex flex-col gap-2">
                            {/* Available Fields - At the top */}
                            <div
                                data-drop-zone="available"
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (draggedField && draggedFromSource && draggedFromSource !== 'available') {
                                        handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'available');
                                    }
                                    setDraggedField(null);
                                    setDraggedFromSource(null);
                                    setDraggedIndex(null);
                                }}
                                className={`w-full border border-[#3a4252] rounded-lg p-1.5 bg-[#1a1f30] transition-colors ${dropZoneHighlight === 'available'
                                    ? 'border-primary bg-primary/10'
                                    : ''
                                    }`}
                            >
                                <div className="text-xs font-semibold text-foreground mb-1">Available Fields</div>
                                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                    {availableFields.map(field => (
                                        <div
                                            key={field.id}
                                            draggable
                                            onDragStart={(e) => {
                                                setDraggedField(field.id);
                                                setDraggedFromSource('available');
                                                setDraggedIndex(null);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => {
                                                setDraggedField(null);
                                                setDraggedFromSource(null);
                                                setDraggedIndex(null);
                                            }}
                                            onTouchStart={(e) => {
                                                const touch = e.touches[0];
                                                setDraggedField(field.id);
                                                setDraggedFromSource('available');
                                                setDraggedIndex(null);
                                                setTouchDragState({
                                                    isDragging: true,
                                                    startX: touch.clientX,
                                                    startY: touch.clientY,
                                                    currentX: touch.clientX,
                                                    currentY: touch.clientY
                                                });
                                            }}
                                            className="flex items-center gap-1 p-1 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 active:bg-accent transition-colors touch-none"
                                            style={{
                                                opacity: touchDragState?.isDragging && draggedField === field.id ? 0.5 : 1
                                            }}
                                        >
                                            <GripVertical className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-foreground flex-1">{field.label}</span>
                                            <span className="text-xs text-muted-foreground px-1 py-0.5 rounded bg-muted">
                                                {field.type === 'measure' ? 'M' : 'D'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Pivot Configuration Areas - Below Available Fields */}
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Filters - Top Left */}
                                <div
                                    data-drop-zone="filters"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedField && draggedFromSource) {
                                            handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'filters');
                                        }
                                        setDraggedField(null);
                                        setDraggedFromSource(null);
                                        setDraggedIndex(null);
                                    }}
                                    className={`border rounded-lg p-1.5 bg-[#1a1f30] min-h-[60px] transition-colors ${dropZoneHighlight === 'filters'
                                        ? 'border-primary bg-primary/10'
                                        : 'border-[#3a4252]'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Filters</div>
                                        <div className="relative group">
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                            <div className="absolute left-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                                                <div className="text-xs text-popover-foreground mb-1"><strong>Filter data sebelum dihitung</strong></div>
                                                <div className="text-xs text-muted-foreground">Contoh: Buyer Broker → pilih broker tertentu, Transaction Time → pilih range waktu</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {tempPivotConfig.filters.map((filterConfig, idx) => {
                                            const field = availableFields.find(f => f.id === filterConfig.field);
                                            if (!field) return null;

                                            // Time range filter
                                            if (filterConfig.filterType === 'timeRange') {
                                                const isDragging = draggedField === filterConfig.field && draggedFromSource === 'filters';
                                                return (
                                                    <div
                                                        key={idx}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            setDraggedField(filterConfig.field);
                                                            setDraggedFromSource('filters');
                                                            setDraggedIndex(idx);
                                                            e.dataTransfer.effectAllowed = 'move';
                                                        }}
                                                        onDragEnd={() => {
                                                            setDraggedField(null);
                                                            setDraggedFromSource(null);
                                                            setDraggedIndex(null);
                                                        }}
                                                        onTouchStart={(e) => {
                                                            e.stopPropagation();
                                                            const touch = e.touches[0];
                                                            setDraggedField(filterConfig.field);
                                                            setDraggedFromSource('filters');
                                                            setDraggedIndex(idx);
                                                            setTouchDragState({
                                                                isDragging: true,
                                                                startX: touch.clientX,
                                                                startY: touch.clientY,
                                                                currentX: touch.clientX,
                                                                currentY: touch.clientY
                                                            });
                                                        }}
                                                        className={`p-1 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${isDragging ? 'opacity-50' : ''
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <GripVertical className="w-3 h-3 text-muted-foreground" />
                                                            <span className="text-xs text-foreground flex-1 font-medium">{field.label}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPivotConfig(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== idx) }));
                                                                }}
                                                                onTouchStart={(e) => e.stopPropagation()}
                                                                className="text-muted-foreground hover:text-foreground"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <input
                                                                type="time"
                                                                value={filterConfig.timeRange?.start || '08:00'}
                                                                onChange={(e) => {
                                                                    const newFilters = [...tempPivotConfig.filters];
                                                                    if (newFilters[idx]) {
                                                                        newFilters[idx].timeRange = {
                                                                            ...(newFilters[idx].timeRange || { start: '08:00', end: '16:00' }),
                                                                            start: e.target.value
                                                                        };
                                                                        setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                                                    }
                                                                }}
                                                                className="text-xs bg-background border border-[#3a4252] rounded px-2 py-1"
                                                            />
                                                            <span className="text-xs text-muted-foreground">to</span>
                                                            <input
                                                                type="time"
                                                                value={filterConfig.timeRange?.end || '16:00'}
                                                                onChange={(e) => {
                                                                    const newFilters = [...tempPivotConfig.filters];
                                                                    if (newFilters[idx]) {
                                                                        newFilters[idx].timeRange = {
                                                                            ...(newFilters[idx].timeRange || { start: '08:00', end: '16:00' }),
                                                                            end: e.target.value
                                                                        };
                                                                        setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                                                    }
                                                                }}
                                                                className="text-xs bg-background border border-[#3a4252] rounded px-2 py-1"
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // List filter
                                            const allData = selectedDates.flatMap(date => doneDetailData.get(date) || []);
                                            const uniqueValues = [...new Set(allData.map(item => {
                                                const value = item[filterConfig.field as keyof DoneDetailData];
                                                if (filterConfig.field === 'HAKA_HAKI') {
                                                    return value === 1 ? 'HAKA' : 'HAKI';
                                                }
                                                return String(value || '');
                                            }))].sort((a, b) => {
                                                if (filterConfig.field === 'HAKA_HAKI') {
                                                    if (a === 'HAKA' && b === 'HAKI') return -1;
                                                    if (a === 'HAKI' && b === 'HAKA') return 1;
                                                    return a.localeCompare(b);
                                                }
                                                const numA = parseFloat(a);
                                                const numB = parseFloat(b);
                                                if (!isNaN(numA) && !isNaN(numB)) {
                                                    return numA - numB;
                                                }
                                                return a.localeCompare(b);
                                            });
                                            const searchTerm = tempFilterSearchTerms[filterConfig.field] || '';
                                            const isDropdownOpen = tempOpenFilterDropdowns[filterConfig.field] || false;
                                            const filteredValues = uniqueValues.filter(v =>
                                                v.toLowerCase().includes(searchTerm.toLowerCase())
                                            );

                                            const isDragging = draggedField === filterConfig.field && draggedFromSource === 'filters';
                                            return (
                                                <div
                                                    key={idx}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggedField(filterConfig.field);
                                                        setDraggedFromSource('filters');
                                                        setDraggedIndex(idx);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedField(null);
                                                        setDraggedFromSource(null);
                                                        setDraggedIndex(null);
                                                    }}
                                                    onTouchStart={(e) => {
                                                        e.stopPropagation();
                                                        const touch = e.touches[0];
                                                        setDraggedField(filterConfig.field);
                                                        setDraggedFromSource('filters');
                                                        setDraggedIndex(idx);
                                                        setTouchDragState({
                                                            isDragging: true,
                                                            startX: touch.clientX,
                                                            startY: touch.clientY,
                                                            currentX: touch.clientX,
                                                            currentY: touch.clientY
                                                        });
                                                    }}
                                                    className={`p-1 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${isDragging ? 'opacity-50' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-sm text-foreground flex-1 font-medium">{field.label}</span>
                                                        {filterConfig.values.length > 0 && (
                                                            <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                                                                {filterConfig.values.length}
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTempPivotConfig(prev => ({ ...prev, filters: prev.filters.filter((_, i) => i !== idx) }));
                                                                const newSearchTerms = { ...tempFilterSearchTerms };
                                                                delete newSearchTerms[filterConfig.field];
                                                                setTempFilterSearchTerms(newSearchTerms);
                                                                const newDropdowns = { ...tempOpenFilterDropdowns };
                                                                delete newDropdowns[filterConfig.field];
                                                                setTempOpenFilterDropdowns(newDropdowns);
                                                            }}
                                                            onTouchStart={(e) => e.stopPropagation()}
                                                            className="text-muted-foreground hover:text-foreground"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>

                                                    <div className="relative" data-filter-dropdown>
                                                        <div
                                                            className="relative cursor-pointer"
                                                            onClick={() => setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: !prev[filterConfig.field] }))}
                                                        >
                                                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                                            <input
                                                                type="text"
                                                                placeholder={filterConfig.values.length > 0 ? `${filterConfig.values.length} selected - Click to search` : "Click to search and select..."}
                                                                value={searchTerm}
                                                                onChange={(e) => {
                                                                    setTempFilterSearchTerms(prev => ({ ...prev, [filterConfig.field]: e.target.value }));
                                                                    setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: true }));
                                                                }}
                                                                onFocus={() => {
                                                                    setTempOpenFilterDropdowns(prev => ({ ...prev, [filterConfig.field]: true }));
                                                                }}
                                                                className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-[#3a4252] rounded cursor-text"
                                                                readOnly={!isDropdownOpen}
                                                            />
                                                        </div>

                                                        {isDropdownOpen && (
                                                            <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border border-[#3a4252] rounded shadow-lg z-50">
                                                                {filteredValues.length > 0 ? (
                                                                    <>
                                                                        <label
                                                                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer border-b-2 border-[#3a4252] font-medium bg-muted/30"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={filterConfig.values.length === uniqueValues.length && uniqueValues.length > 0}
                                                                                onChange={(e) => {
                                                                                    const newFilters = [...tempPivotConfig.filters];
                                                                                    const currentFilter = newFilters[idx];
                                                                                    if (currentFilter) {
                                                                                        if (e.target.checked) {
                                                                                            currentFilter.values = [...uniqueValues];
                                                                                        } else {
                                                                                            currentFilter.values = [];
                                                                                        }
                                                                                        setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                                                                    }
                                                                                }}
                                                                                className="w-3 h-3"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                            <span className="text-xs text-foreground flex-1 font-semibold">All ({uniqueValues.length})</span>
                                                                        </label>
                                                                        {filteredValues.map(value => (
                                                                            <label
                                                                                key={value}
                                                                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer border-b border-[#3a4252]/50 last:border-b-0"
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={filterConfig.values.includes(value)}
                                                                                    onChange={(e) => {
                                                                                        const newFilters = [...tempPivotConfig.filters];
                                                                                        if (newFilters[idx]) {
                                                                                            if (e.target.checked) {
                                                                                                newFilters[idx].values = [...newFilters[idx].values, value];
                                                                                            } else {
                                                                                                newFilters[idx].values = newFilters[idx].values.filter(v => v !== value);
                                                                                            }
                                                                                            setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                                                                        }
                                                                                    }}
                                                                                    className="w-3 h-3"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                />
                                                                                <span className="text-xs text-foreground flex-1">{value}</span>
                                                                            </label>
                                                                        ))}
                                                                    </>
                                                                ) : (
                                                                    <div className="text-xs text-muted-foreground px-2 py-2 text-center">No results found</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {filterConfig.values.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {filterConfig.values.slice(0, 5).map(value => (
                                                                <div key={value} className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/20 text-primary rounded text-xs">
                                                                    <span>{value}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            const newFilters = [...tempPivotConfig.filters];
                                                                            if (newFilters[idx]) {
                                                                                newFilters[idx].values = newFilters[idx].values.filter(v => v !== value);
                                                                                setTempPivotConfig(prev => ({ ...prev, filters: newFilters }));
                                                                            }
                                                                        }}
                                                                        className="hover:bg-primary/30 rounded px-0.5"
                                                                    >
                                                                        <X className="w-2.5 h-2.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {filterConfig.values.length > 5 && (
                                                                <div className="text-xs text-muted-foreground px-1.5 py-0.5">
                                                                    +{filterConfig.values.length - 5} more
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {tempPivotConfig.filters.length === 0 && (
                                            <div className="text-xs text-muted-foreground italic py-2 text-center">Drop fields here</div>
                                        )}
                                    </div>
                                </div>

                                {/* Columns - Top Right */}
                                <div
                                    data-drop-zone="columns"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedField && draggedFromSource) {
                                            handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'columns');
                                        }
                                        setDraggedField(null);
                                        setDraggedFromSource(null);
                                        setDraggedIndex(null);
                                    }}
                                    className={`border rounded-lg p-1.5 bg-[#1a1f30] min-h-[60px] transition-colors ${dropZoneHighlight === 'columns'
                                        ? 'border-primary bg-primary/10'
                                        : 'border-[#3a4252]'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Columns</div>
                                        <div className="relative group">
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                            <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                                                <div className="text-xs text-popover-foreground mb-1"><strong>Kolom - akan menjadi header horizontal</strong></div>
                                                <div className="text-xs text-muted-foreground">Contoh: Broker → setiap kolom menampilkan broker yang berbeda</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        {tempPivotConfig.columns.map((fieldId, idx) => {
                                            const field = availableFields.find(f => f.id === fieldId);
                                            const isDragging = draggedField === fieldId && draggedFromSource === 'columns';
                                            return field ? (
                                                <div
                                                    key={idx}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggedField(fieldId);
                                                        setDraggedFromSource('columns');
                                                        setDraggedIndex(idx);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedField(null);
                                                        setDraggedFromSource(null);
                                                        setDraggedIndex(null);
                                                    }}
                                                    onTouchStart={(e) => {
                                                        e.stopPropagation();
                                                        const touch = e.touches[0];
                                                        setDraggedField(fieldId);
                                                        setDraggedFromSource('columns');
                                                        setDraggedIndex(idx);
                                                        setTouchDragState({
                                                            isDragging: true,
                                                            startX: touch.clientX,
                                                            startY: touch.clientY,
                                                            currentX: touch.clientX,
                                                            currentY: touch.clientY
                                                        });
                                                    }}
                                                    className={`flex items-center gap-1 p-1 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${isDragging ? 'opacity-50' : ''
                                                        }`}
                                                >
                                                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-xs text-foreground flex-1">{field.label}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setTempPivotConfig(prev => ({ ...prev, columns: prev.columns.filter((_, i) => i !== idx) }));
                                                        }}
                                                        onTouchStart={(e) => e.stopPropagation()}
                                                        className="text-muted-foreground hover:text-foreground"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : null;
                                        })}
                                        {tempPivotConfig.columns.length === 0 && (
                                            <div className="text-xs text-muted-foreground italic py-2 text-center">Drop fields here</div>
                                        )}
                                    </div>
                                </div>

                                {/* Rows - Bottom Left */}
                                <div
                                    data-drop-zone="rows"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedField && draggedFromSource) {
                                            handleDropTemp(draggedField, draggedFromSource, draggedIndex, 'rows');
                                        }
                                        setDraggedField(null);
                                        setDraggedFromSource(null);
                                        setDraggedIndex(null);
                                    }}
                                    className={`border rounded-lg p-1.5 bg-[#1a1f30] min-h-[60px] transition-colors ${dropZoneHighlight === 'rows'
                                        ? 'border-primary bg-primary/10'
                                        : 'border-[#3a4252]'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Rows</div>
                                        <div className="relative group">
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                            <div className="absolute left-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                                                <div className="text-xs text-popover-foreground mb-1"><strong>Baris - akan menjadi kolom pertama</strong></div>
                                                <div className="text-xs text-muted-foreground">Contoh: Price → setiap baris menampilkan harga yang berbeda</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        {tempPivotConfig.rows.map((fieldId, idx) => {
                                            const field = availableFields.find(f => f.id === fieldId);
                                            const isPrice = fieldId === 'STK_PRIC';
                                            const isDragging = draggedField === fieldId && draggedFromSource === 'rows';
                                            return field ? (
                                                <div
                                                    key={idx}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggedField(fieldId);
                                                        setDraggedFromSource('rows');
                                                        setDraggedIndex(idx);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => {
                                                        setDraggedField(null);
                                                        setDraggedFromSource(null);
                                                        setDraggedIndex(null);
                                                    }}
                                                    onTouchStart={(e) => {
                                                        e.stopPropagation();
                                                        const touch = e.touches[0];
                                                        setDraggedField(fieldId);
                                                        setDraggedFromSource('rows');
                                                        setDraggedIndex(idx);
                                                        setTouchDragState({
                                                            isDragging: true,
                                                            startX: touch.clientX,
                                                            startY: touch.clientY,
                                                            currentX: touch.clientX,
                                                            currentY: touch.clientY
                                                        });
                                                    }}
                                                    className={`p-1 bg-background rounded border border-[#3a4252] cursor-move hover:bg-accent/50 transition-colors touch-none ${isDragging ? 'opacity-50' : ''
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                                                        <span className="text-xs text-foreground flex-1">{field.label}</span>
                                                        {isPrice && (
                                                            <select
                                                                value={tempPivotConfig.sort?.field === 'STK_PRIC' ? tempPivotConfig.sort.direction : 'desc'}
                                                                onChange={(e) => {
                                                                    setTempPivotConfig(prev => ({
                                                                        ...prev,
                                                                        sort: { field: 'STK_PRIC', direction: e.target.value as 'asc' | 'desc' }
                                                                    }));
                                                                }}
                                                                className="text-[10px] bg-background border border-[#3a4252] rounded px-1 py-0.5 h-5 leading-none"
                                                                onClick={(e) => e.stopPropagation()}
                                                                onTouchStart={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="desc">Desc</option>
                                                                <option value="asc">Asc</option>
                                                            </select>
                                                        )}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setTempPivotConfig(prev => {
                                                                    const newRows = prev.rows.filter((_, i) => i !== idx);
                                                                    if (prev.sort?.field === fieldId) {
                                                                        const { sort, ...rest } = prev;
                                                                        return { ...rest, rows: newRows };
                                                                    }
                                                                    return { ...prev, rows: newRows };
                                                                });
                                                            }}
                                                            onTouchStart={(e) => e.stopPropagation()}
                                                            className="text-muted-foreground hover:text-foreground"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null;
                                        })}
                                        {tempPivotConfig.rows.length === 0 && (
                                            <div className="text-xs text-muted-foreground italic py-2 text-center">Drop fields here</div>
                                        )}
                                    </div>
                                </div>

                                {/* Values - Bottom Right */}
                                <div className="border border-[#3a4252] rounded-lg p-1.5 bg-[#1a1f30] min-h-[60px]">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="text-xs font-semibold text-muted-foreground uppercase">Values</div>
                                        <div className="relative group">
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                            <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[9999] pointer-events-none text-xs">
                                                <div className="text-xs text-popover-foreground mb-1"><strong>Pilih aggregation untuk Volume</strong></div>
                                                <div className="text-xs text-muted-foreground">Volume secara default sudah ada. Centang aggregation yang ingin ditampilkan.</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="p-1 bg-background rounded border border-[#3a4252]">
                                            <div className="text-xs text-foreground font-medium mb-1">Volume</div>
                                            <div className="space-y-1">
                                                {(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const).map((agg) => (
                                                    <label key={agg} className="flex items-center gap-1.5 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={tempPivotConfig.aggregations.includes(agg)}
                                                            onChange={(e) => {
                                                                setTempPivotConfig(prev => {
                                                                    if (e.target.checked) {
                                                                        return {
                                                                            ...prev,
                                                                            aggregations: [...prev.aggregations, agg]
                                                                        };
                                                                    } else {
                                                                        const newAggregations = prev.aggregations.filter(a => a !== agg);
                                                                        if (newAggregations.length === 0) {
                                                                            return { ...prev, aggregations: ['COUNT'] };
                                                                        }
                                                                        return { ...prev, aggregations: newAggregations };
                                                                    }
                                                                });
                                                            }}
                                                            className="w-3 h-3"
                                                        />
                                                        <span className="text-xs text-foreground leading-none">
                                                            {agg === 'COUNT' ? 'Count' :
                                                                agg === 'SUM' ? 'Sum' :
                                                                    agg === 'AVG' ? 'Avg' :
                                                                        agg === 'MIN' ? 'Min' :
                                                                            agg === 'MAX' ? 'Max' : agg}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons - Sticky at the bottom of the container */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-[#3a4252] bg-[#0a0f20]">
                <div className="flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 min-w-[70px]"
                        onClick={() => {
                            setTempPivotConfig({ rows: [], columns: [], valueField: 'STK_VOLM', aggregations: ['COUNT'], filters: [] });
                            setTempFilterSearchTerms({});
                            setTempOpenFilterDropdowns({});
                        }}
                    >
                        Reset
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 min-w-[70px]"
                            onClick={() => {
                                setIsPivotBuilderOpen(false);
                            }}
                        >
                            Cancel
                        </Button>

                        <Button
                            size="sm"
                            className="h-8 min-w-[70px]"
                            onClick={() => {
                                setPivotConfig(tempPivotConfig);
                                setFilterSearchTerms(tempFilterSearchTerms);
                                setOpenFilterDropdowns(tempOpenFilterDropdowns);
                                setIsPivotBuilderOpen(false);
                            }}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

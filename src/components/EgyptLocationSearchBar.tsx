import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Search, MapPin, Compass, X, Loader2, CornerDownLeft, CornerDownRight } from 'lucide-react';
import {
  EGYPT_GOVERNORATES,
  GovernorateOption,
  normalizeArabicDigits,
} from '../lib/validation';
import { GOV_EN_MAP, useI18n } from '../lib/i18n';

export interface SelectedMapDestination {
  label: string;
  sublabel?: string;
  lat: number;
  lng: number;
  zoom?: number;
  viewport?: google.maps.LatLngBounds | null;
  governorateName?: string;
}

interface EgyptLocationSearchBarProps {
  onSelectDestination: (dest: SelectedMapDestination) => void;
  activeDestinationLabel: string | null;
  onClearDestination: () => void;
}

function checkAndDispatchQuotaError(err: unknown) {
  const msg = String(err);
  if (
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

export const EgyptLocationSearchBar: React.FC<EgyptLocationSearchBarProps> = ({
  onSelectDestination,
  activeDestinationLabel,
  onClearDestination,
}) => {
  const placesLib = useMapsLibrary('places');
  const { lang, isRtl, t, govLabel } = useI18n();

  const [queryText, setQueryText] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState<boolean>(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    setPlaceSuggestions([]);
  }, []);

  useEffect(() => {
    if (activeDestinationLabel === null) {
      setQueryText('');
    }
  }, [activeDestinationLabel]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const matchedGovernorates = useMemo<GovernorateOption[]>(() => {
    const trimmed = normalizeArabicDigits(queryText).trim().toLowerCase();
    if (!trimmed) return EGYPT_GOVERNORATES.slice(0, 6);
    return EGYPT_GOVERNORATES.filter((g) => {
      const enName = (GOV_EN_MAP[g.name] || govLabel(g.name)).toLowerCase();
      return (
        g.name.toLowerCase().includes(trimmed) ||
        `محافظة ${g.name}`.toLowerCase().includes(trimmed) ||
        enName.includes(trimmed) ||
        `${enName} governorate`.includes(trimmed)
      );
    }).slice(0, 5);
  }, [queryText, govLabel]);

  useEffect(() => {
    const trimmed = queryText.trim();
    if (!placesLib || trimmed.length < 2) {
      setPlaceSuggestions([]);
      setIsLoadingPlaces(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;

      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new AutocompleteSessionToken();
      }

      const request: google.maps.places.AutocompleteRequest = {
        input: trimmed,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['eg'],
        language: lang,
        region: 'EG',
      };

      setIsLoadingPlaces(true);
      AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then((res) => {
          setPlaceSuggestions(res?.suggestions ?? []);
          setIsLoadingPlaces(false);
        })
        .catch((err) => {
          console.error('Error fetching Egypt place suggestions:', err);
          checkAndDispatchQuotaError(err);
          setPlaceSuggestions([]);
          setIsLoadingPlaces(false);
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [placesLib, queryText, lang]);

  const handleSelectGovernorate = useCallback(
    (gov: GovernorateOption) => {
      const label = isRtl ? `محافظة ${gov.name}` : `${govLabel(gov.name)} Governorate`;
      setQueryText(label);
      setIsOpen(false);
      setHighlightedIndex(-1);
      resetSession();
      onSelectDestination({
        label,
        sublabel: t('انتقال مباشر للمحافظة في خريطة إيجار', 'Direct jump on Ejar Egypt Map'),
        lat: gov.lat,
        lng: gov.lng,
        zoom: gov.zoom,
        governorateName: gov.name,
      });
    },
    [onSelectDestination, resetSession, isRtl, govLabel, t]
  );

  const handleSelectPlaceSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;

      const labelText = suggestion.placePrediction.text?.text || '';
      setIsFetchingDetails(true);
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });

        const loc = place.location;
        if (loc) {
          const lat = loc.lat();
          const lng = loc.lng();
          const finalLabel = place.displayName || labelText;

          const fullAddress = `${finalLabel} ${place.formattedAddress || ''}`.toLowerCase();
          const matchedGov = EGYPT_GOVERNORATES.find(
            (g) =>
              fullAddress.includes(g.name.toLowerCase()) ||
              fullAddress.includes(govLabel(g.name).toLowerCase())
          );

          setQueryText(finalLabel);
          setIsOpen(false);
          setHighlightedIndex(-1);

          onSelectDestination({
            label: finalLabel,
            sublabel: place.formattedAddress || undefined,
            lat,
            lng,
            zoom: 14,
            viewport: place.viewport ?? null,
            governorateName: matchedGov?.name,
          });
        }
        resetSession();
      } catch (err) {
        console.error('Error fetching selected place coordinates:', err);
        checkAndDispatchQuotaError(err);
      } finally {
        setIsFetchingDetails(false);
      }
    },
    [placesLib, onSelectDestination, resetSession, govLabel]
  );

  const totalNavigableCount = matchedGovernorates.length + placeSuggestions.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();

    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalNavigableCount > 0) {
        setHighlightedIndex((prev) => (prev + 1) % totalNavigableCount);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalNavigableCount > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? totalNavigableCount - 1 : prev - 1));
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < matchedGovernorates.length) {
        handleSelectGovernorate(matchedGovernorates[highlightedIndex]);
      } else if (
        highlightedIndex >= matchedGovernorates.length &&
        highlightedIndex < totalNavigableCount
      ) {
        const placeIdx = highlightedIndex - matchedGovernorates.length;
        void handleSelectPlaceSuggestion(placeSuggestions[placeIdx]);
      } else if (placeSuggestions.length > 0) {
        void handleSelectPlaceSuggestion(placeSuggestions[0]);
      } else if (matchedGovernorates.length > 0) {
        handleSelectGovernorate(matchedGovernorates[0]);
      }
    }
  };

  const handleClear = () => {
    setQueryText('');
    setPlaceSuggestions([]);
    setHighlightedIndex(-1);
    setIsOpen(false);
    resetSession();
    onClearDestination();
  };

  const ActionCornerIcon = isRtl ? CornerDownLeft : CornerDownRight;

  return (
    <div ref={containerRef} className="relative w-full z-20">
      <div
        onClick={() => inputRef.current?.focus()}
        className="bg-white border border-slate-200/90 focus-within:border-blue-700 rounded-2xl p-1.5 sm:p-2 shadow-xs transition-colors cursor-text"
      >
        <div className="flex items-center gap-2">
          <div className="ps-2 text-blue-700 shrink-0">
            {isLoadingPlaces || isFetchingDetails ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={queryText}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQueryText(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'ابحث عن محافظة أو حي في مصر (الزمالك، التجمع، سموحة...)',
              'Search any Egyptian governorate or district (Zamalek, New Cairo, Smouha...)'
            )}
            aria-label={t(
              'ابحث عن محافظة أو منطقة في خريطة إيجار',
              'Search governorate or district on Ejar Map'
            )}
            className="w-full min-w-0 min-h-[38px] sm:min-h-[42px] py-1.5 sm:py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
          />

          {(queryText || activeDestinationLabel) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
                inputRef.current?.focus();
              }}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-800 rounded-xl transition-colors shrink-0 cursor-pointer"
              aria-label={t('مسح البحث وإعادة ضبط الموقع', 'Clear search and reset location')}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (placeSuggestions.length > 0) {
                void handleSelectPlaceSuggestion(placeSuggestions[0]);
              } else if (matchedGovernorates.length > 0) {
                handleSelectGovernorate(matchedGovernorates[0]);
              }
            }}
            disabled={!queryText.trim() || isFetchingDetails}
            className="min-h-[42px] px-3.5 sm:px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">{t('انتقل', 'Go')}</span>
            <span className="hidden sm:inline">{t('انتقل للمنطقة', 'Go to Area')}</span>
            <ActionCornerIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && (matchedGovernorates.length > 0 || placeSuggestions.length > 0 || isLoadingPlaces) && (
        <div className="absolute right-0 left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden max-h-[360px] overflow-y-auto">
          {matchedGovernorates.length > 0 && (
            <div className="p-2">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                {queryText.trim()
                  ? t('محافظات مصر المطابقة', 'Matching Governorates')
                  : t('انتقال سريع لمحافظات مصر', 'Quick Jump to Egypt Governorates')}
              </div>
              <ul role="listbox">
                {matchedGovernorates.map((gov, idx) => {
                  const isActive = highlightedIndex === idx;
                  return (
                    <li key={gov.name}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectGovernorate(gov)}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-start flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                          isActive ? 'bg-blue-50 text-slate-900' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <Compass className="w-4 h-4 text-blue-700 shrink-0" />
                          <span>
                            {isRtl ? `محافظة ${gov.name}` : `${govLabel(gov.name)} Governorate`}
                          </span>
                        </span>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                          {t('انتقال بالخريطة', 'Fly to Map')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {queryText.trim().length >= 2 && (
            <div className="p-2 border-t border-slate-100">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>{t('مناطق وأحياء وشوارع في مصر', 'Districts, Streets & Landmarks in Egypt')}</span>
                {isLoadingPlaces && (
                  <span className="text-slate-400">{t('جاري البحث...', 'Searching...')}</span>
                )}
              </div>

              {placeSuggestions.length === 0 && !isLoadingPlaces ? (
                <div className="px-3 py-3 text-xs text-slate-500">
                  {t(
                    'لا توجد نتائج إضافية مطابقة للاسم المدخل في مصر.',
                    'No additional places matched in Egypt.'
                  )}
                </div>
              ) : (
                <ul role="listbox">
                  {placeSuggestions.map((suggestion, idx) => {
                    const globalIdx = matchedGovernorates.length + idx;
                    const isActive = highlightedIndex === globalIdx;
                    const mainText =
                      suggestion.placePrediction?.mainText?.text ||
                      suggestion.placePrediction?.text?.text ||
                      '';
                    const secondaryText =
                      suggestion.placePrediction?.secondaryText?.text || '';

                    return (
                      <li key={suggestion.placePrediction?.placeId || idx}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void handleSelectPlaceSuggestion(suggestion)}
                          className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-start flex items-start gap-2.5 text-xs transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-blue-50 text-slate-900'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 truncate">{mainText}</div>
                            {secondaryText && (
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {secondaryText}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

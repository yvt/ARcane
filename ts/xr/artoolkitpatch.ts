export function initializeMinSubmarker(controllerId: number, multimarkerId: number)
{
    const emscriptenModule = (<any>window).Module;
    const HEAP32 = emscriptenModule.HEAP32;

    // Extracted from / based on `artoolkit.debug.js`

    /// `std::__1::__hash_iterator<std::__1::__hash_node<std::__1::__hash_value_type<int, arController>, void*>*> std::
    /// __1::__hash_table<std::__1::__hash_value_type<int, arController>, std::__1::__unordered_map_hasher<int, std::__1::
    /// __hash_value_type<int, arController>, std::__1::hash<int>, true>, std::__1::__unordered_map_equal<int, std::__1::
    /// __hash_value_type<int, arController>, std::__1::equal_to<int>, true>, std::__1::allocator<std::__1::
    /// __hash_value_type<int, arController> > >::find<int>(int const&)`
    function __ZNSt3__112__hash_tableINS_17__hash_value_typeIi12arControllerEENS_22__unordered_map_hasherIiS3_NS_4hashIiEELb1EEENS_21__unordered_map_equalIiS3_NS_8equal_toIiEELb1EEENS_9allocatorIS3_EEE4findIiEENS_15__hash_iteratorIPNS_11__hash_nodeIS3_PvEEEERKT_($this: number, $__k: number) {
        $this = $this | 0;
        $__k = $__k | 0;
        var $$pn = 0, $0 = 0, $11 = 0, $12 = 0, $16 = 0, $2 = 0, $20 = 0, $24 = 0, $4 = 0, $6 = 0, $__nd$0 = 0;
        // The first argument was modified to accept `int` instead of `int const &`
        // $0 = HEAP32[$__k >> 2] | 0;
        $0 = $__k | 0;
        $2 = HEAP32[$this + 4 >> 2] | 0;
        L1 : do if (!$2) $24 = 0; else {
            $4 = $2 + -1 | 0;
            $6 = ($4 & $2 | 0) == 0 ? 1 : 0;
            if ($6) $11 = $4 & $0; else $11 = ($0 >>> 0) % ($2 >>> 0) | 0;
            $12 = HEAP32[(HEAP32[$this >> 2] | 0) + ($11 << 2) >> 2] | 0;
            if (!$12) $24 = 0; else {
                $$pn = $12;
                while (1) {
                    $__nd$0 = HEAP32[$$pn >> 2] | 0;
                    if (!$__nd$0) {
                        $24 = 0;
                        break L1;
                    }
                    $16 = HEAP32[$__nd$0 + 4 >> 2] | 0;
                    if ($6) $20 = $16 & $4; else $20 = ($16 >>> 0) % ($2 >>> 0) | 0;
                    if (($20 | 0) != ($11 | 0)) {
                        $24 = 0;
                        break L1;
                    }
                    if ((HEAP32[$__nd$0 + 8 >> 2] | 0) == ($0 | 0)) {
                        $24 = $__nd$0;
                        break;
                    } else $$pn = $__nd$0;
                }
            }
        } while (0);
        return $24 | 0;
    }

    /// `std::__1::unordered_map<int, arController, std::__1::hash<int>, std::__1::equal_to<int>, std::__1::allocator<std::__1::pair<int const, arController> > >::operator[](int const&)`
    function __ZNSt3__113unordered_mapIi12arControllerNS_4hashIiEENS_8equal_toIiEENS_9allocatorINS_4pairIKiS1_EEEEEixERS8_($this: number, $__k: number) {
        $this = $this | 0;
        $__k = $__k | 0;
        var $$pn3 = 0, $1 = 0, $5 = 0;
        $1 = __ZNSt3__112__hash_tableINS_17__hash_value_typeIi12arControllerEENS_22__unordered_map_hasherIiS3_NS_4hashIiEELb1EEENS_21__unordered_map_equalIiS3_NS_8equal_toIiEELb1EEENS_9allocatorIS3_EEE4findIiEENS_15__hash_iteratorIPNS_11__hash_nodeIS3_PvEEEERKT_($this, $__k) | 0;
        if (!$1) {
            throw new Error("ARController not found");
        }
        $$pn3 = $1;
        return $$pn3 + 16 | 0;
    }

    /// `std::unordered_map<_, _> *`
    const arControllers = 2044;

    const entry = __ZNSt3__113unordered_mapIi12arControllerNS_4hashIiEENS_8equal_toIiEENS_9allocatorINS_4pairIKiS1_EEEEEixERS8_(
        arControllers,
        controllerId,
    );
    /// `arController *`
    const arc = HEAP32[entry + 248 >> 2];

    /// `(multi_marker *) &(arc->multi_markers[multiMarkerId])`
    const multiMatch = arc + (multimarkerId << 3) + 4;

    /// `(ARMultiMarkerInfoT *) multiMatch->multiMarkerHandle`
    const arMulti = HEAP32[multiMatch >> 2];

    /// `(int *) arMulti->min_submarker`
    const minSubmarker = arMulti + 128;

    HEAP32[minSubmarker >> 2] = 0;
}

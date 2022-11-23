let Datasource = require('@ldf/core').datasources.Datasource,
    SparqlJsonParser = require('sparqljson-parse').SparqlJsonParser,
    LRU = require('lru-cache');

const hash = require('object-hash'), fetch = require('node-fetch');

let DEFAULT_COUNT_ESTIMATE = { totalCount: 1e9, hasExactCount: false };
let ENDPOINT_ERROR = 'Error accessing JSON-LD endpoint';
let INVALID_JSON_RESPONSE = 'The endpoint returned an invalid JSON response.';
const xsd  = 'http://www.w3.org/2001/XMLSchema#';

class ConceptNetDatasource extends Datasource {
  constructor(options) {
    super(options);

    this._countCache = new LRU({ max: 1000, maxAge: 1000 * 60 * 60 * 3 });
    this._resolvingCountQueries = {};
    this._sparqlJsonParser = new SparqlJsonParser({ dataFactory: this.dataFactory });

    options = options || {};
    this._endpoint = this._endpointUrl = (options.endpoint || '').replace(/[\?#][^]*$/, '');
    this._mapping = options.mapping || '';
    this._baseUri = options.baseUri || 'http://conceptnet.io';
    this._languages = options.languages || [];
  }

  // Writes the results of the query to the given triple stream
  async _executeQuery(query, destination) {
    const pattern = this._createQuadPattern(query), self = this,
        uriQuery = this._createUriRequest(pattern, query.offset, query.limit),
        url = `${this._endpointUrl}${uriQuery}`;

    let json = '';
    let errored = false;
    let response;
    try {
      response = await fetch(url);
      for await (const chunk of response.body)
        json += chunk.toString();
    }
    catch (err) {
      return emitError({ message: err.message });
    }

    try {
      response = JSON.parse(json);
    }
    catch (e) {
      return emitError({ message: INVALID_JSON_RESPONSE });
    }

    if (!response.edges) return;

    for (const edge of response.edges) {
      if (!this._shouldFilterLanguage(edge)) {
        let binding = this._edge2quad(edge);
        binding = this._sparqlJsonParser.parseJsonBindings(binding);

        let triple = {
          subject:   binding.s || query.subject,
          predicate: binding.p || query.predicate,
          object:    binding.o || query.object,
          graph:     binding.g || query.graph,
        };
        destination._push(triple);
      }
    }
    destination.close();

    // Determine the total number of matching triples
    this._getTotalNumber(pattern).then((count) => {
      destination.setProperty('metadata', count);
    },
    emitError);

    function emitError(error) {
      if (!error || errored) return;
      errored = true;
      destination.emit('error', new Error(ENDPOINT_ERROR + ' ' + self._endpoint + ': ' + error.message));
    }
  }

  // Retrieves the (approximate) number of triples that match the pattern
  _getTotalNumber(pattern) {
    // Try to find a cache match
    const cachePattern = hash(pattern);

    let cache = this._countCache, count = cache.get(cachePattern);
    if (count)
      return Promise.resolve({ totalCount: count, hasExactCount: true });

    // Immediately return the fallback URL if a count is already going on.
    if (this._resolvingCountQueries[cachePattern])
      return Promise.resolve(DEFAULT_COUNT_ESTIMATE);

    return new Promise(async (resolve, reject) => {
      this._resolvingCountQueries[cachePattern] = true;
      // Execute the count query
      let uri = `${this._endpointUrl}${this._createUriRequest(pattern, 0, 1000)}`;
      let countResponse = await this._count(uri);

      delete this._resolvingCountQueries[cachePattern];
      // Cache large values; small ones are calculated fast anyway
      if (countResponse.totalCount > 100000)
        cache.set(cachePattern, countResponse.totalCount);

      resolve({ totalCount: countResponse.totalCount, hasExactCount: true });
    });
  }

  // Complete the URI with parameters to access the desired data from the given pattern
  _createUriRequest(quadPattern, offset, limit) {
    let queryParams = '';

    if (quadPattern && Object.keys(quadPattern).length > 0) {
      if (quadPattern.subject) queryParams = `${queryParams}&start=${quadPattern.subject}`;
      if (quadPattern.predicate) queryParams = `${queryParams}&rel=${quadPattern.predicate}`;
      if (quadPattern.object) queryParams = `${queryParams}&end=${quadPattern.object}`;
      if (quadPattern.graph) queryParams = `${queryParams}&dataset=${quadPattern.graph}`;
    }

    if (offset) queryParams = `${queryParams}&offset=${offset}`;
    if (limit) queryParams = `${queryParams}&limit=${limit}`;

    return queryParams.startsWith('&') && (`?${queryParams.slice(1)}`);
  }

  // Creates a quad pattern
  _createQuadPattern(quad) {
    let quadPattern = {};

    quad.subject && (quadPattern.subject = this._encodeObject(quad.subject));
    quad.predicate && (quadPattern.predicate = this._encodeObject(quad.predicate));
    quad.object && (quadPattern.object = this._encodeObject(quad.object));
    quad.graph && (quadPattern.graph = this._encodeObject(quad.graph));

    return quadPattern;
  }

  _shouldFilterLanguage(edge) {
    if (!this._languages || this._languages.length === 0) return false;

    const s = edge.start, o = edge.end;

    return ((s.hasOwnProperty('language') && !this._languages.includes(s.language)) ||
    (o.hasOwnProperty('language') && !this._languages.includes(o.language)));
  }

  _encodeObject(term) {
    switch (term.termType) {
    case 'NamedNode':
      return term.value.replace(this._baseUri, '');
    case 'BlankNode':
      return '_:' + term.value;
    case 'Variable':
      return '?' + term.value;
    case 'DefaultGraph':
      return '';
    case 'Literal':
      return this._convertLiteral(term);
    default:
      return null;
    }
  }

  _isURL(value) {
    try { return Boolean(new URL(value)); }
    catch (e) { return false; }
  }

  _convertLiteral(term) {
    if (!term)
      return '?o';
    else {
      return ((!/["\\]/.test(term.value)) ?  '"' + term.value + '"' : '"""' + term.value.replace(/(["\\])/g, '\\$1') + '"""') +
        (term.language ? '@' + term.language :
          (term.datatype && term.datatype.value !== xsd + 'string' ? '^^' + this._encodeObject(term.datatype) : this._forceTypedLiterals ? '^^<http://www.w3.org/2001/XMLSchema#string>' : ''));
    }
  }

  _count(url, count = 0) {
    return new Promise(async (resolve, reject) => {
      url = new URL(url);

      let json = '';
      let response;
      try {
        response = await fetch(url);
        for await (const chunk of response.body)
          json += chunk.toString();
      }
      catch (err) {
        resolveToDefault();
      }

      try { response = JSON.parse(json); }
      catch (e) { resolveToDefault(); }

      if (!response.hasOwnProperty('edges')) resolve(0);

      // filter language
      if (this._languages && this._languages.length > 0) {
        count += response.edges.filter(e => (e.start.language && this._languages.includes(e.start.language)) ||
        (e.end.language && this._languages.includes(e.end.language))).length;
      }
      else
        count += response.edges.length;

      if (response.hasOwnProperty('view')) {
        let view = response.view;
        if (view.hasOwnProperty('paginatedProperty') &&
        view.paginatedProperty === 'edges' &&
        view.hasOwnProperty('nextPage')) {
          let origin = url.origin;
          await this._count(origin + view.nextPage, count);
        }
      }
      else resolve({ totalCount: count, hasExactCount: true });

      function resolveToDefault() { resolve(DEFAULT_COUNT_ESTIMATE); }
      // When no result arrives in time, send a default count
      // (the correct result might still end up in the cache for future use)
      setTimeout(resolveToDefault, 3000);
    });
  }

  _edge2quad(edge) {
    const s = edge.start, p = edge.rel, o = edge.end, g = edge.dataset;

    let binding = {};

    binding.s = { type: 'uri', value: this._isURL(s['@id']) ? s['@id'] : `${this._baseUri}${s['@id']}` };
    binding.p = { type: 'uri', value: this._isURL(p['@id']) ? p['@id'] : `${this._baseUri}${p['@id']}` };
    binding.o = { type: 'uri', value: this._isURL(o['@id']) ? o['@id'] : `${this._baseUri}${o['@id']}` };
    binding.g = { type: 'uri', value: this._isURL(g) ? g : `${this._baseUri}${g}` };

    return binding;
  }
}

module.exports = ConceptNetDatasource;

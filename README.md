# Linked Data Fragments Server - JSON-LD Endpoint Datasources
<img src="http://linkeddatafragments.org/images/logo.svg" width="200" align="right" alt="" />

[![npm version](https://badge.fury.io/js/%40ldf%2Fdatasource-conceptnet.svg)](https://www.npmjs.com/package/@ldf/datasource-conceptnet)


This module contains a JSON-LD service datasource for the [Linked Data Fragments server](https://github.com/LinkedDataFragments/Server.js).
It allows JSON-LD services to be used as a data proxy.

_This package is a [Linked Data Fragments Server module](https://github.com/LinkedDataFragments/Server.js/)._

## Usage in `@ldf/server`

This package exposes the following config entries:
* `ConceptNetDatasource`: A JSON-LD service based datasource that requires at least one `endpoint` field. _Should be used as `@type` value._
* `endpoint`: Refers to a JSON-LD endpoint capable of receiving and processing requests. _Should be used as key in a `ConceptNetDatasource`._
*  `baseUri`: Refers to a base URI that will be prefixed to the results. _Should be used as key in a `ConceptNetDatasource`._
* `languages`: Refers to filtering the results by some langagues. Default []. _Should be used as key in a `ConceptNetDatasource`._

Example:
```json
{
  "@context": "https://linkedsoftwaredependencies.org/bundles/npm/@ldf/server/^3.0.0/components/context.jsonld",
  "@id": "urn:ldf-server:my",
  "import": "preset-qpf:config-defaults.json",

  "datasources": [
    {
      "@id": "urn:ldf-server:myJsonLdServiceDatasource",
      "@type": "ConceptNetDatasource",
      "datasourceTitle": "My JSON-LD service source",
      "description": "My datasource with a JSON_LD service",
      "datasourcePath": "myjsonldservice",
      "endpoint": "https://api.conceptnet.io/query", 
      "baseUri": "http://conceptnet.io",
      "languages": ["en"]
    }
  ]
}
```

## Usage in other packages

When this module is used in a package other than `@ldf/server`,
then the ConceptNet context `https://linkedsoftwaredependencies.org/contexts/@ldf/datasource-conceptnet.jsonld` must be imported.

For example:
```
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@ldf/core/^3.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@ldf/preset-qpf/^3.0.0/components/context.jsonld",
    "https://linkedsoftwaredependencies.org/bundles/npm/@ldf/datasource-conceptnet/^3.0.0/components/context.jsonld",
  ],
  // Same as above...
}
```

## License

The datasource module is written by Marcelo de Oliveira Costa Machado.

The Linked Data Fragments server is written by [Ruben Verborgh](https://ruben.verborgh.org/), Miel Vander Sande, [Ruben Taelman](https://www.rubensworks.net/) and colleagues.

This code is copyrighted by [Ghent University – imec](http://idlab.ugent.be/)
and released under the [MIT license](http://opensource.org/licenses/MIT).
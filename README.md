
# HDR metadata TRAnslation SERvice (TRASER)

A microservice for converting between different schemas of metadata.

## Setup

### Install the package

```
git clone -b dev https://github.com/HDRUK/traser.git
cd traser
```

### Setup env varialbes
```
cp env.example .env
```

### Run the API (Dev)

Via docker 
```
docker-compose up --build 
```

Or just:
```
npm install
npm run dev
```

### Run via tilt 

In the gateway-api main `tiltconf.json` you need to make sure that TRASER is enabled:
```
{
    ...
    "traserServiceRoot": "<path to source code>",
    "traserEnabled": true,
    ...
}
```
When `tilt up` is run, TRASER will be running on port `8002`, otherwise you can port-forward by getting the service pod name via `kubectl get pods` and running:
```
kubectl port-forward <traser pod name>  <port to forward to>:3001
```



## Swagger Documentation

[http://localhost:3001/docs/](http://localhost:3001/docs/)

## Endpoints Overview

### Translate (POST)


Posting `{'metadata':<hdruk 2.1.2 metadata>}`
Full:
```
/translate?output_schema=GWDM&output_version=1.0&input_schema=HDRUK&input_version=2.1.2
```
Will return 200 and `{<GWDM 1.0 metadata>}` if successfull.


No input specified:
```
/translate?output_schema=GWDM&output_version=1.0
```
The service will attempt to detect the input metadata schema and version and find a translation map based on this.

No queries specified:
```
/translate
```
The service will assume the output is the latest version of the GWDM (1.0), attempt to detect the input metadata schema and version and find a translation map based on this. 


Posting `{'metadata':<GWDM 1.0 metadata>}` 
```
/translate
```
The service will assume the output is the latest version of the GWDM (1.0), the service will detect that the input is already the GWDM, the service will not try any translation and will return a 200 with the original metadata in the returned payload.


### Find (POST)


Posting `{'metadata':<hdruk 2.1.2 metadata>}` to 
```
/find
```

Will return:
```
[
    {
        "name": "HDRUK",
        "version": "2.1.2",
        "matches": false
    },
    {
        "name": "GWDM",
        "version": "1.0",
        "matches": true
    },
    {
        "name": "SchemaOrg",
        "version": "default",
        "matches": false
    },
    {
        "name": "SchemaOrg",
        "version": "BioSchema",
        "matches": false
    },
    {
        "name": "SchemaOrg",
        "version": "GoogleRecommended",
        "matches": false
    }
]
```

### Get (GET)

```
/get/schema?name=GWDM&version=1.0'
```
Returns the json-schema for GWDM version 1.0 

```
/get/map?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=1.0
```
Returns a translation map file

### Validate (POST)

`{'metadata':<GWDM 1.0 metadata>}` to 
```
/validate?input_schema=GWDM&input_version=1.0
```
Will return a 200 and:
```
{
    "details": "all ok"
}
```

## Examples

### Translate

#### HDRUK 2.1.2 to GWDM 1.0

```
curl --location 'http://localhost:3001/translate?output_schema=GWDM&output_version=1.0&input_schema=HDRUK&input_version=2.1.2' \
--header 'Content-Type: application/json' \
--data-raw '{
    "extra": {
        "id": "1234",
        "pid": "5124f2",
        "controlledKeyWords": [
            "Papers",
            "COVID-19",
            "controlledWord"
        ],
        "pathwayDescription": "Not APPLICABLE for blah reason",
        "datasetType": "list of papers",
        "isGeneratedUsing": "something",
        "dataUses": "dunno",
        "isMemberOf": "blah"
    },
    "metadata": {
        "identifier": "https://web.www.healthdatagateway.org/dataset/a7ddefbd-31d9-4703-a738-256e4689f76a",
        "version": "2.0.0",
        "summary": {
            "title": "HDR UK Papers & Preprints",
            "doiName": "10.1093/ije/dyx196",
            "abstract": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
            "publisher": {
                "name": "HEALTH DATA RESEARCH UK",
                "memberOf": "OTHER",
                "contactPoint": "susheel.varma@hdruk.ac.uk"
            },
            "contactPoint": "susheel.varma@hdruk.ac.uk",
            "keywords": [
                "Preprints",
                "Papers",
                "HDR UK"
            ]
        },
        "documentation": {
            "description": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations\n\nThis will include:\n- Papers\n- COVID-19 Papers\n- COVID-19 Preprint",
            "associatedMedia": [
                "https://github.com/HDRUK/papers"
            ],
            "isPartOf": "NOT APPLICABLE"
        },
        "revisions": [
            {
                "version": "1.0.0",
                "url": "https://d5faf9c6-6c34-46d7-93c4-7706a5436ed9"
            },
            {
                "version": "2.0.0",
                "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
            },
            {
                "version": "0.0.1",
                "url": "https://9e798632-442a-427b-8d0e-456f754d28dc"
            },
            {
                "version": "2.1.1",
                "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
            }
        ],
        "modified": "2021-01-28T14:15:46Z",
        "issued": "2020-08-05T14:35:59Z",
        "accessibility": {
            "formatAndStandards": {
                "language": "en",
                "vocabularyEncodingScheme": "OTHER",
                "format": [
                    "CSV",
                    "JSON"
                ],
                "conformsTo": "OTHER"
            },
            "usage": {
                "dataUseLimitation": "GENERAL RESEARCH USE",
                "resourceCreator": "HDR UK Science Team",
                "dataUseRequirements": "RETURN TO DATABASE OR RESOURCE",
                "isReferencedBy": [
                    "10.5281/zenodo.326615"
                ],
                "investigations": [
                    "https://github.com/HDRUK/papers"
                ]
            },
            "access": {
                "dataController": "HDR UK",
                "jurisdiction": "GB-ENG",
                "dataProcessor": "HDR UK",
                "accessService": "https://github.com/HDRUK/papers",
                "accessRights": [
                    "https://raw.githubusercontent.com/HDRUK/papers/master/LICENSE"
                ],
                "accessRequestCost": "Free",
                "deliveryLeadTime": "OTHER"
            }
        },
        "observations": [
            {
                "observedNode": "FINDINGS",
                "measuredValue": 575,
                "disambiguatingDescription": "Number of papers with affiliation and/or acknowledgement to HDR UK",
                "observationDate": "2020-11-27",
                "measuredProperty": "Count"
            }
        ],
        "provenance": {
            "temporal": {
                "endDate": "2022-04-30",
                "timeLag": "NOT APPLICABLE",
                "distributionReleaseDate": "2020-11-27",
                "accrualPeriodicity": "DAILY",
                "startDate": "2020-03-31"
            },
            "origin": {
                "purpose": "OTHER",
                "source": "MACHINE GENERATED",
                "collectionSituation": [
                    "OTHER"
                ]
            }
        },
        "coverage": {
            "followup": "UNKNOWN",
            "spatial": "https://www.geonames.org/countries/GB/united-kingdom.html",
            "physicalSampleAvailability": [
                "NOT AVAILABLE"
            ],
            "pathway": "NOT APPLICABLE",
            "typicalAgeRange": "0-0"
        },
        "enrichmentAndLinkage": {
            "tools": [
                "https://github.com/HDRUK/papers"
            ],
            "qualifiedRelation": [
                "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357"
            ],
            "derivation": [
                "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357"
            ]
        },
        "structuralMetadata": [
            {
                "name": "table1",
                "description": "this is table 1",
                "elements": [
                    {
                        "name": "column1",
                        "description": "this is column1",
                        "dataType": "String",
                        "sensitive": false
                    }
                ]
            }
        ]
    }
}'
```

#### GWDM 1.0 to Schema.Org

```
curl --location 'http://localhost:3001/translate?output_schema=SchemaOrg&output_version=default&input_schema=GWDM&input_version=1.0' \
--header 'Content-Type: application/json' \
--data-raw '{
    "metadata": {
        "required": {
            "gatewayId": "1234",
            "gatewayPid": "5124f2",
            "issued": "2020-08-05T14:35:59Z",
            "modified": "2021-01-28T14:15:46Z",
            "revisions": [
                {
                    "version": "1.0.0",
                    "url": "https://d5faf9c6-6c34-46d7-93c4-7706a5436ed9"
                },
                {
                    "version": "2.0.0",
                    "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
                },
                {
                    "version": "0.0.1",
                    "url": "https://9e798632-442a-427b-8d0e-456f754d28dc"
                },
                {
                    "version": "2.1.1",
                    "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
                }
            ]
        },
        "summary": {
            "abstract": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
            "contactPoint": "susheel.varma@hdruk.ac.uk",
            "keywords": "Preprints,Papers,HDR UK",
            "controlledKeywords": "",
            "datasetType": "list of papers",
            "description": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations\n\nThis will include:\n- Papers\n- COVID-19 Papers\n- COVID-19 Preprint",
            "doiName": "10.1093/ije/dyx196",
            "shortTitle": "HDR UK Papers & Preprints",
            "title": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
            "publisher": {
                "publisherName": "HEALTH DATA RESEARCH UK"
            }
        },
        "coverage": {
            "pathway": "NOT APPLICABLE",
            "physicalSampleAvailability": "NOT AVAILABLE",
            "spatial": "https://www.geonames.org/countries/GB/united-kingdom.html",
            "followup": "UNKNOWN",
            "typicalAgeRange": "0-0"
        },
        "provenance": {
            "origin": {
                "purpose": "OTHER",
                "source": "MACHINE GENERATED",
                "collectionSituation": "OTHER"
            },
            "temporal": {
                "endDate": "2022-04-30",
                "startDate": "2020-03-31",
                "timeLag": "NOT APPLICABLE",
                "accrualPeriodicity": "DAILY",
                "distributionReleaseDate": "2020-11-27"
            }
        },
        "accessibility": {
            "access": {
                "deliveryLeadTime": "OTHER",
                "jurisdiction": "GB-ENG",
                "dataController": "HDR UK",
                "dataProcessor": "HDR UK",
                "accessRights": "https://raw.githubusercontent.com/HDRUK/papers/master/LICENSE",
                "accessService": "https://github.com/HDRUK/papers",
                "accessRequestCost": "Free"
            },
            "usage": {
                "dataUseLimitation": "GENERAL RESEARCH USE",
                "dataUseRequirement": "RETURN TO DATABASE OR RESOURCE",
                "resourceCreator": "HDR UK Science Team"
            },
            "formatAndStandards": {
                "vocabularyEncodingSchemes": "OTHER",
                "conformsTo": "OTHER",
                "languages": "en",
                "formats": "CSV,JSON"
            }
        },
        "linkage": {
            "isGeneratedUsing": "something",
            "dataUses": "dunno",
            "isReferenceIn": "10.5281/zenodo.326615",
            "tools": "https://github.com/HDRUK/papers",
            "datasetLinkage": {
                "isDerivedFrom": "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357",
                "isPartOf": "NOT APPLICABLE",
                "isMemberOf": "blah",
                "linkedDatasets": "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357"
            },
            "investigations": "https://github.com/HDRUK/papers"
        },
        "observations": [
            {
                "observedNode": "FINDINGS",
                "measuredValue": 575,
                "observationDate": "2020-11-27",
                "measuredProperty": "Count",
                "disambiguatingDescription": "Number of papers with affiliation and/or acknowledgement to HDR UK"
            }
        ],
        "structuralMetadata": [
            {
                "name": "table1",
                "description": "this is table 1",
                "columns": [
                    {
                        "name": "column1",
                        "description": "this is column1",
                        "dataType": "String",
                        "sensitive": false
                    }
                ]
            }
        ]
    }
}'
```


#### Unspecified Input Metadata (Schema.org) 

```
curl --location 'http://localhost:3001/translate?output_schema=GWDM&output_version=1.0' \
--header 'Content-Type: application/json' \
--data-raw '{
    "metadata": {
        "@context": "https://schema.org/",
        "@id": "https://hdruk.ac.uk",
        "@type": "Dataset",
        "identifier": "10.1093/ije/dyx196",
        "version": "GDMv1",
        "url": "https://hdruk.ac.uk/1234",
        "name": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
        "alternateName": "HDR UK Papers & Preprints",
        "description": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations\n\nThis will include:\n- Papers\n- COVID-19 Papers\n- COVID-19 Preprint",
        "abstract": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
        "citation": "10.1093/ije/dyx196",
        "funder": {
            "@type": "Organization",
            "legalName": "HDR UK Science Team",
            "name": "HDR UK Science Team",
            "identifier": "",
            "sameAs": null,
            "email": null
        },
        "usageInfo": {
            "@type": "CreativeWork",
            "name": "usage",
            "accessibilitySummary": "GENERAL RESEARCH USE",
            "abstract": "",
            "accessMode": "",
            "identifier": "",
            "creator": null,
            "publisher": null
        },
        "creator": {
            "@type": "Organization",
            "legalName": "HDR UK Science Team",
            "name": "HDR UK Science Team",
            "email": "susheel.varma@hdruk.ac.uk",
            "identifier": "",
            "sameAs": null
        },
        "maintainer": {
            "@type": "Organization",
            "legalName": "HDR UK",
            "name": "HDR UK",
            "email": "susheel.varma@hdruk.ac.uk",
            "identifier": "",
            "sameAs": null
        },
        "publisher": {
            "@type": "Organization",
            "legalName": "HEALTH DATA RESEARCH UK",
            "name": "HEALTH DATA RESEARCH UK",
            "identifier": "",
            "sameAs": null,
            "email": null
        },
        "spatialCoverage": "MACHINE GENERATED",
        "temporalCoverage": "2020-03-31/2022-04-30",
        "isAccessibleForFree": true,
        "dateCreated": "2020-08-05T14:35:59Z",
        "distribution": {
            "@type": "DataDownload",
            "name": "https://github.com/HDRUK/papers",
            "contentUrl": "https://somehwere.com",
            "encodingFormat": "Unknown"
        },
        "keywords": "Preprints,Papers,HDR UK",
        "license": "https://raw.githubusercontent.com/HDRUK/papers/master/LICENSE",
        "accessMode": "",
        "accessibilitySummary": "",
        "includedInDataCatalog": null,
        "isBasedOn": null,
        "isPartOf": null,
        "hasPart": null,
        "measurementTechnique": "",
        "sameAs": null,
        "variableMeasured": "",
        "dateModified": null,
        "datePublished": null
    }
}'
```


### Find

#### Finding the metadata model/version

```
curl --location 'http://localhost:3001/find' \
--header 'Content-Type: application/json' \
--data-raw '{
    "required": {
        "gatewayId": "a7ddefbd-31d9-4703-a738-256e4689f76a",
        "gatewayPid": "5124f2",
        "issued": "2020-08-05T14:35:59Z",
        "modified": "2021-01-28T14:15:46Z",
        "revisions": [
            {
                "version": "1.0.0",
                "url": "https://d5faf9c6-6c34-46d7-93c4-7706a5436ed9"
            },
            {
                "version": "2.0.0",
                "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
            },
            {
                "version": "0.0.1",
                "url": "https://9e798632-442a-427b-8d0e-456f754d28dc"
            },
            {
                "version": "2.1.1",
                "url": "https://a7ddefbd-31d9-4703-a738-256e4689f76a"
            }
        ]
    },
    "summary": {
        "abstract": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
        "contactPoint": "susheel.varma@hdruk.ac.uk",
        "keywords": "Preprints,Papers,HDR UK",
        "controlledKeywords": "",
        "datasetType": "list of papers",
        "description": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations\n\nThis will include:\n- Papers\n- COVID-19 Papers\n- COVID-19 Preprint",
        "doiName": "10.1093/ije/dyx196",
        "shortTitle": "HDR UK Papers & Preprints",
        "title": "Publications that mention HDR-UK (or any variant thereof) in Acknowledgements or Author Affiliations",
        "publisher": {
            "publisherName": "HEALTH DATA RESEARCH UK"
        }
    },
    "coverage": {
        "pathway": "NOT APPLICABLE",
        "physicalSampleAvailability": "NOT AVAILABLE",
        "spatial": "https://www.geonames.org/countries/GB/united-kingdom.html",
        "followup": "UNKNOWN",
        "typicalAgeRange": "0-0"
    },
    "provenance": {
        "origin": {
            "purpose": "OTHER",
            "source": "MACHINE GENERATED",
            "collectionSituation": "OTHER"
        },
        "temporal": {
            "endDate": "2022-04-30",
            "startDate": "2020-03-31",
            "timeLag": "NOT APPLICABLE",
            "accrualPeriodicity": "DAILY",
            "distributionReleaseDate": "2020-11-27"
        }
    },
    "accessibility": {
        "access": {
            "deliveryLeadTime": "OTHER",
            "jurisdiction": "GB-ENG",
            "dataController": "HDR UK",
            "dataProcessor": "HDR UK",
            "accessRights": "https://raw.githubusercontent.com/HDRUK/papers/master/LICENSE",
            "accessService": "https://github.com/HDRUK/papers",
            "accessRequestCost": "Free"
        },
        "usage": {
            "dataUseLimitation": "GENERAL RESEARCH USE",
            "dataUseRequirement": "RETURN TO DATABASE OR RESOURCE",
            "resourceCreator": "HDR UK Science Team"
        },
        "formatAndStandards": {
            "vocabularyEncodingSchemes": "OTHER",
            "conformsTo": "OTHER",
            "languages": "en",
            "formats": "CSV,JSON"
        }
    },
    "linkage": {
        "isGeneratedUsing": "something",
        "dataUses": "dunno",
        "isReferenceIn": "10.5281/zenodo.326615",
        "tools": "https://github.com/HDRUK/papers",
        "datasetLinkage": {
            "isDerivedFrom": "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357",
            "isPartOf": "NOT APPLICABLE",
            "isMemberOf": "blah",
            "linkedDatasets": "https://web.www.healthdatagateway.org/dataset/fd8d0743-344a-4758-bb97-f8ad84a37357"
        },
        "investigations": "https://github.com/HDRUK/papers"
    },
    "observations": [
        {
            "observedNode": "FINDINGS",
            "measuredValue": 575,
            "observationDate": "2020-11-27",
            "measuredProperty": "Count",
            "disambiguatingDescription": "Number of papers with affiliation and/or acknowledgement to HDR UK"
        }
    ],
    "structuralMetadata": [
        {
            "name": "table1",
            "description": "this is table 1",
            "columns": [
                {
                    "name": "column1",
                    "description": "this is column1",
                    "dataType": "String",
                    "sensitive": false
                }
            ]
        }
    ]
}'
```

Output:
```
[
    {
        "name": "HDRUK",
        "version": "2.1.2",
        "matches": false
    },
    {
        "name": "GWDM",
        "version": "1.0",
        "matches": true
    },
    {
        "name": "SchemaOrg",
        "version": "default",
        "matches": false
    },
    {
        "name": "SchemaOrg",
        "version": "BioSchema",
        "matches": false
    },
    {
        "name": "SchemaOrg",
        "version": "GoogleRecommended",
        "matches": false
    }
]
```




# Setup

## Install the package

```
git clone --recursive https://github.com/HDRUK/translation-service-poc-jsonata.git
cd translation-service-poc-jsonata
```

## Run the API (Dev)

Via docker 
```
docker-compose up --build 
```

Or just:
```
npm install
npm run dev
```



# Examples

## Working example

```
curl --location 'http://localhost:3000/translate?to=gdmv1' \
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
        "IsGeneratedUsing": "something",
        "dataUses": "dunno"
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
        }
    }
}'
```

## Missing field Example

```
{
    "error": "Not valid against any known schema",
    "schemas": {
        "hdrukv211": {
            "details": [
                {
                    "instancePath": "",
                    "schemaPath": "#/required",
                    "keyword": "required",
                    "params": {
                        "missingProperty": "version"
                    },
                    "message": "must have required property 'version'"
                }
            ]
        },
        "gdmv1": {
            "details": [
                {
                    "instancePath": "",
                    "schemaPath": "#/required",
                    "keyword": "required",
                    "params": {
                        "missingProperty": "required"
                    },
                    "message": "must have required property 'required'"
                }
            ]
        }
    }
}
```

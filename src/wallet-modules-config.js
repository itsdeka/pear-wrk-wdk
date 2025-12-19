// Auto-generated from schema.json - do not edit manually
module.exports = [
  {
    "id": "evm-erc-4337",
    "package": "@tetherto/wdk-wallet-evm-erc-4337",
    "networks": [
      "ethereum",
      "polygon",
      "arbitrum",
      "plasma"
    ]
  },
  {
    "id": "spark",
    "package": "@tetherto/wdk-wallet-spark",
    "networks": [
      "spark"
    ],
    "prerequisites": [
      {
        "package": "@buildonspark/spark-frost-bare-addon",
        "required": true
      }
    ]
  }
]

# ─────────────────────────────────────────────────────────────────────────
# Geo-DNS Routing via Route53 Geolocation
# ─────────────────────────────────────────────────────────────────────────
# Routes end-users to the nearest edge (CloudFront distribution) based on
# their geographic origin.  Each continent gets an alias A/AAAA record
# pointing to the same CloudFront distribution; future work can introduce
# per-region origin stacks for true active-active multi-region.
#
# Resolver hierarchy (most specific → least specific)
#   1. Country code         (e.g. "US", "DE", "JP")
#   2. Continent code       (e.g. "NA", "EU", "AS")
#   3. Default ("*")        – catch-all for unmapped locations
#
# The present config uses continent-level records.  Add country-code
# records when latency data from production shows a need.

# ── Existing hosted zone (expected to be created separately) ────────────
data "aws_route53_zone" "app" {
  name         = var.app_domain_name
  private_zone = false
}

# ── Continent geolocation records (all alias → CloudFront) ──────────────

# North America
resource "aws_route53_record" "app_geo_na" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-NA-${var.environment}"

  geolocation_routing_policy {
    continent = "NA"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Europe
resource "aws_route53_record" "app_geo_eu" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-EU-${var.environment}"

  geolocation_routing_policy {
    continent = "EU"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Asia
resource "aws_route53_record" "app_geo_as" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-AS-${var.environment}"

  geolocation_routing_policy {
    continent = "AS"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# South America
resource "aws_route53_record" "app_geo_sa" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-SA-${var.environment}"

  geolocation_routing_policy {
    continent = "SA"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Africa
resource "aws_route53_record" "app_geo_af" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-AF-${var.environment}"

  geolocation_routing_policy {
    continent = "AF"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Oceania
resource "aws_route53_record" "app_geo_oc" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-OC-${var.environment}"

  geolocation_routing_policy {
    continent = "OC"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Antarctica (edge case, literally)
resource "aws_route53_record" "app_geo_an" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-AN-${var.environment}"

  geolocation_routing_policy {
    continent = "AN"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# Default catch-all (any location not matched above)
resource "aws_route53_record" "app_geo_default" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = var.app_domain_name
  type    = "A"

  set_identifier = "geo-default-${var.environment}"

  geolocation_routing_policy {
    country = "*"
  }

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# ── www subdomain (CNAME alias to apex) ──────────────────────────────────
resource "aws_route53_record" "app_www" {
  zone_id = data.aws_route53_zone.app.zone_id
  name    = "www.${var.app_domain_name}"
  type    = "A"

  set_identifier = "www-${var.environment}"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = true
  }
}

# ── Outputs ──────────────────────────────────────────────────────────────
output "app_dns_name" {
  value       = var.app_domain_name
  description = "Main application domain name"
}

output "cloudfront_alias_zone_id" {
  value       = aws_cloudfront_distribution.frontend.hosted_zone_id
  description = "Hosted zone ID of the CloudFront distribution (for Route53 alias records)"
}

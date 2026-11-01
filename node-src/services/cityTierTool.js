/**
 * ============================================================================
 * AIRTEL BUSINESS AI AGENT - CITY-TO-TIER TOOL SERVICE
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES:
 * This tool enables the AI discovery agent to automatically determine the
 * telecommunications infrastructure network tier (Tier 1 or Tier 2) and state
 * whenever a customer mentions their business city.
 * 
 * 💡 WHY THIS IS CRITICAL FOR AIRTEL BUSINESS:
 * High-bandwidth leased lines, MPLS, SD-WAN, and specialized enterprise bundles
 * depend on the customer's city tier (`available_city_tiers`).
 * - Tier 1: Metro hubs (Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad)
 * - Tier 2: Secondary commercial hubs (Jaipur, Kochi, Lucknow, Bhopal, Surat, Indore, etc.)
 * 
 * 🔧 TOOL SPECIFICATION:
 * - Name: lookup_city_tier
 * - Input: { city: string }
 * - Output: { city, city_tier: 1|2, state: string, matched: boolean, source: string }
 * ============================================================================
 */

const { findCityTier, getAllCityTiers } = require('../db/dbClient');

class CityTierTool {
  /**
   * JSON Schema specification formatted for standard LLM Tool Calling
   */
  static get specification() {
    return {
      type: 'function',
      function: {
        name: 'lookup_city_tier',
        description: 'Look up the telecom network infrastructure tier (Tier 1 or Tier 2) and state for a customer business city in India.',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'The Indian city name provided by the customer (e.g. "Hyderabad", "Mumbai", "Jaipur", "Bangalore").'
            }
          },
          required: ['city']
        }
      }
    };
  }

  /**
   * Executes the city tier lookup against PostgreSQL database table / memory store
   * @param {Object} input - { city: string }
   * @returns {Promise<Object>} { city, city_tier, state, matched, source }
   */
  async execute({ city }) {
    if (!city || typeof city !== 'string') {
      return { city: null, city_tier: 2, state: null, matched: false, error: 'City name required' };
    }

    const result = await findCityTier(city);
    return result;
  }

  /**
   * Directly applies the tool lookup output to the CustomerSchema instance.
   * Updates `city_tier`, `city` (canonicalized), and `state` (if empty).
   * @param {Object} schema - CustomerSchema instance
   * @param {Object} toolResult - Output of execute({ city })
   * @returns {Object} Diff of applied fields
   */
  applyToSchema(schema, toolResult) {
    if (!schema || !toolResult) return {};

    const diff = {};

    if (toolResult.city_tier !== undefined && toolResult.city_tier !== null) {
      if (schema.city_tier !== toolResult.city_tier) {
        diff.city_tier = { old: schema.city_tier, new: toolResult.city_tier };
        schema.city_tier = toolResult.city_tier;
      }
    }

    // Canonicalize city name if a standard canonical match was resolved (e.g., Bombay -> Mumbai)
    if (toolResult.matched && toolResult.city && schema.city !== toolResult.city) {
      diff.city = { old: schema.city, new: toolResult.city };
      schema.city = toolResult.city;
    }

    // Populate state if currently null/empty
    if (toolResult.state && !schema.state) {
      diff.state = { old: schema.state, new: toolResult.state };
      schema.state = toolResult.state;
    }

    return diff;
  }

  /**
   * Returns list of all supported cities with tiers
   */
  async listAllCities() {
    return await getAllCityTiers();
  }
}

const cityTierTool = new CityTierTool();

module.exports = {
  CityTierTool,
  cityTierTool
};

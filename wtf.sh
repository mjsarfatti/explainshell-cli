#!/usr/bin/env bash
set -euo pipefail
# set -x # DEBUG: Trace execution

# Check for dependencies
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq could not be found. Please install it (e.g., 'brew install jq' or 'sudo apt-get install jq')"
  exit 1
fi
if ! command -v pup &>/dev/null; then
  echo "ERROR: pup could not be found. Please install it (e.g., 'brew install pup' or 'go install github.com/ericchiang/pup@latest')"
  # Note: pup installation might be more complex than apt/brew for some users.
  # For now, I'll assume it's manageable.
  exit 1
else
  echo "WARNING: pup has been deprecated because it is not maintained upstream! It was disabled on 2025-02-24. Nevertheless, we are using it for now."
fi

args="$*"
echo "DEBUG: Args received: $args" # DEBUG

if [ -z "$args" ]; then
  echo "Usage: $0 '<command>'"
  exit 1
fi

final_output_string="" # Initialize variable to store all output

query=$(printf %s "$args" | jq -sRr @uri)
echo "DEBUG: Query for URL: $query" # DEBUG

url="https://explainshell.com/explain?cmd=$query"
echo "DEBUG: Fetching URL: $url" # DEBUG

response=$(curl -s "$url")
echo "DEBUG: Response received (first 200 chars): ${response:0:200}" # DEBUG
if [ -z "$response" ]; then
  echo "DEBUG: Response is empty. Exiting."
  exit 1
fi

# Extract command parts and their help references
# command_parts_html=$(echo "$response" | pup 'div#command span[helpref]') # No longer a separate variable
help_texts_html=$(echo "$response" | pup 'pre.help-box')
echo "DEBUG: Help texts HTML (first 200 chars): ${help_texts_html:0:200}" # DEBUG

# Store help texts in an associative array for easy lookup
declare -A help_lookup
echo "DEBUG: Populating help_lookup..." # DEBUG
# Check if help_texts_html is empty before trying to process it
if [ -n "$help_texts_html" ]; then
  while read -r id; do
    echo "DEBUG: help_lookup: Processing ID: $id" # DEBUG
    text=$(echo "$help_texts_html" | pup "#${id} text{}" | sed -e 's/&amp;/&/g' -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g' -e "s/&#39;/'/g")
    echo "DEBUG: help_lookup: Text for ID $id (first 100 chars): ${text:0:100}" # DEBUG
    help_lookup["$id"]=$(echo "$text")
  done < <(echo "$help_texts_html" | pup 'pre.help-box attr{id}')
else
  # If no help texts, help_lookup will be empty. This is not necessarily a fatal error for all commands.
  : # Do nothing, proceed with empty help_lookup
fi
echo "DEBUG: help_lookup population complete. Size: ${#help_lookup[@]}" # DEBUG

# Process and print command parts and their explanations
current_helpref=""
output_buffer=""
# Store expansions to print them after their parent's explanation
declare -A expansions_lookup # Key: helpref, Value: formatted expansion string

echo "DEBUG: Starting main processing loop..." # DEBUG
# Capture the input for the main processing loop
loop_feed_content=$(echo "$response" | pup -i 0 'div#command > span')

printf '%s\n' "$loop_feed_content"

if [ -z "$loop_feed_content" ]; then
  final_output_string="Error: No command parts found by pup selector 'div#command > span'. Cannot generate explanation."
else
  # Process the command parts only if loop_feed_content is not empty
  while IFS= read -r line; do
    echo "DEBUG: Loop: Raw line received: $line" # DEBUG

    helpref=$(echo "$line" | pup 'span attr{helpref}')
    # Extract raw text first to see what pup returns before sed
    command_text_from_pup=$(echo "$line" | pup 'span text{}')
    command_text=$(echo "$command_text_from_pup" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed 's/&nbsp;/ /g')
    echo "DEBUG: Loop: Helpref: '$helpref', Command Text from pup: '$command_text_from_pup', Cleaned Command Text: '$command_text'" # DEBUG

    # Extract raw text for expansion as well
    expansion_text_from_pup=$(echo "$line" | pup 'span span.expansion-substitution a text{}')
    expansion_text=$(echo "$expansion_text_from_pup" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    expansion_link_raw=$(echo "$line" | pup 'span span.expansion-substitution a attr{href}')
    echo "DEBUG: Loop: Expansion Text from pup: '$expansion_text_from_pup', Cleaned Expansion Text: '$expansion_text', Expansion Link Raw: '$expansion_link_raw'" # DEBUG

    if [[ -z "$command_text" && -z "$expansion_text" ]]; then
      echo "DEBUG: Loop: Skipping line as both cleaned command_text and cleaned expansion_text are empty." # DEBUG
      continue
    fi

    expansion_link=""
    if [[ -n "$expansion_link_raw" ]]; then
      if [[ "$expansion_link_raw" == /* ]]; then
        expansion_link="https://explainshell.com$expansion_link_raw"
      else
        # Assuming it's already a full URL if not starting with / (though explainshell usually uses relative)
        expansion_link="$expansion_link_raw"
      fi
    fi
    echo "DEBUG: Loop: Final Expansion Link: '$expansion_link'" # DEBUG

    if [[ "$helpref" != "$current_helpref" ]]; then
      echo "DEBUG: Loop: Helpref changed from '$current_helpref' to '$helpref'." # DEBUG
      if [[ -n "$output_buffer" ]]; then
        echo "DEBUG: Printing output_buffer: [$output_buffer]" # DEBUG
        echo "$output_buffer"
        echo # Add a blank line for readability
        if [[ -n "$current_helpref" && -n "${help_lookup[$current_helpref]}" ]]; then
          echo "DEBUG: Printing help_lookup for '$current_helpref' (first 100 chars): [${help_lookup[$current_helpref]:0:100}]" # DEBUG
          processed_help=$(echo "${help_lookup[$current_helpref]}" | sed 's/^/    /' | fold -s -w 80)
          echo "$processed_help"
          echo # Add a blank line
        else
          echo "DEBUG: No help_lookup text to print for '$current_helpref'." # DEBUG
        fi
        # Print any expansions associated with the previous helpref
        if [[ -n "${expansions_lookup[$current_helpref]}" ]]; then
          echo "DEBUG: Printing expansions_lookup for '$current_helpref': [${expansions_lookup[$current_helpref]}]" # DEBUG
          echo "${expansions_lookup[$current_helpref]}"
          echo
          unset expansions_lookup[$current_helpref] # Clear after printing
        else
          echo "DEBUG: No expansions_lookup to print for '$current_helpref'." # DEBUG
        fi
      fi
      output_buffer="$command_text"
      current_helpref="$helpref"
      echo "DEBUG: Loop: New output_buffer: ['$output_buffer'], New current_helpref: ['$current_helpref']" # DEBUG
    elif [[ -n "$command_text" ]]; then                                                                    # Only append if command_text is not empty
      # Same helpref, append to buffer
      output_buffer+=", DEBUG_JOIN [...] $command_text"                 # Made joiner distinct for debug
      echo "DEBUG: Loop: Appended to output_buffer: ['$output_buffer']" # DEBUG
    fi

    # Store expansion if present, associated with its parent's helpref
    if [[ -n "$expansion_text" && -n "$expansion_link" ]]; then
      formatted_expansion="    [ $expansion_text -> $expansion_link ]"
      echo "DEBUG: Loop: Formatted expansion: '$formatted_expansion' for current_helpref: '$current_helpref'" # DEBUG
      if [[ -n "$current_helpref" ]]; then                                                                    # Ensure current_helpref is set
        # Append if multiple expansions for the same helpref
        if [[ -n "${expansions_lookup[$current_helpref]}" ]]; then
          expansions_lookup[$current_helpref]+=$'\n'"$formatted_expansion"
        else
          expansions_lookup[$current_helpref]="$formatted_expansion"
        fi
        echo "DEBUG: Loop: Updated expansions_lookup for '$current_helpref': [${expansions_lookup[$current_helpref]}]" # DEBUG
      else
        echo "DEBUG: Loop: current_helpref is empty. Cannot store expansion: '$formatted_expansion'" # DEBUG
      fi
    fi

  done < <(printf '%s\n' "$loop_feed_content") # Feed the captured content to the loop

  echo "DEBUG: Main processing loop finished." # DEBUG

  # Print the last buffered command and its explanation
  if [[ -n "$output_buffer" ]]; then
    echo "DEBUG: Printing final output_buffer: [$output_buffer]" # DEBUG
    echo "$output_buffer"
    echo # Add a blank line
    if [[ -n "$current_helpref" && -n "${help_lookup[$current_helpref]}" ]]; then
      echo "DEBUG: Printing final help_lookup for '$current_helpref' (first 100 chars): [${help_lookup[$current_helpref]:0:100}]" # DEBUG
      processed_help=$(echo "${help_lookup[$current_helpref]}" | sed 's/^/    /' | fold -s -w 80)
      echo "$processed_help"
      echo # Add a blank line
    else
      echo "DEBUG: No final help_lookup text to print for '$current_helpref'." # DEBUG
    fi
    # Print any expansions associated with the last helpref
    if [[ -n "${expansions_lookup[$current_helpref]}" ]]; then
      echo "DEBUG: Printing final expansions_lookup for '$current_helpref': [${expansions_lookup[$current_helpref]}]" # DEBUG
      echo "${expansions_lookup[$current_helpref]}"
      echo
    else
      echo "DEBUG: No final expansions_lookup to print for '$current_helpref'." # DEBUG
    fi
  fi
fi # This 'fi' closes the 'if [ -z "$loop_feed_content" ]' block

echo -e "$final_output_string" # Print the collected output at the end

# set +x # DEBUG: Stop tracing

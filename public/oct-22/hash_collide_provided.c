#include <stdio.h>
#include <stdint.h>


int secret_array[] = {};

uint32_t weak_hash(const char *input) {
    uint32_t hash = 0;
    for (int i = 0; input[i] != '\0'; i++) {
        hash += input[i];
    }
    return hash << 2 + hash;
}


int main(int argc, char *argv[]) {

    const char *target_string = "....";
    uint32_t target_hash = weak_hash(target_string);

    if (argc < 2) {
        printf("Target hash: 0x%08x\n", target_hash);
        printf("\nUsage: %s <your_input>\n", argv[0]);
        printf("Find a string that produces the same hash!\n");
        return 1;
    }

    uint32_t input_hash = weak_hash(argv[1]);
    printf("Your input: %s\n", argv[1]);
    printf("Your hash: 0x%08x\n", input_hash);
    printf("Target hash: 0x%08x\n", target_hash);

    if (input_hash == target_hash) {
        for (int i = 0; secret_array[i] != 0; i++) {
        printf("%c%c%c%c",
            secret_array[i] & 0xFF,
            (secret_array[i] >> 8) & 0xFF,
            (secret_array[i] >> 16) & 0xFF,
            (secret_array[i] >> 24) & 0xFF);
        }
        printf("\n");
    } else {
        printf("\nNo collision yet.\n");
    }

    return 0;
}

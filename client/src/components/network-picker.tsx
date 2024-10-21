import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { networkIdAtom, NETWORKS } from "@/store/network";
import { useAtom, useAtomValue } from "jotai";
import { networkAtom } from "@/store/network";
import { useSearchParams } from "react-router-dom";
import { useAtomCallback } from "jotai/utils";
import { useCallback } from "react";

export const NetworkPicker = () => {
  // const [network, setNetwork] = useAtom(networkAtom);
  const network = useAtomValue(networkAtom);
  const [searchParams, setSearchParams] = useSearchParams();

  const setNetworkParam = useAtomCallback(
    useCallback(
      (_get, set, networkId: string) => {
        set(networkAtom, networkId);
        setSearchParams({ network: networkId });
      },
      [setSearchParams]
    )
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={"outline"}>{network.name}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* {NETWORKS.map((network) => (
          <DropdownMenuItem key={network.id} is>{network.name}</DropdownMenuItem>
        ))} */}
        <DropdownMenuRadioGroup
          value={network.id}
          onValueChange={(newNetworkId) => {
            setNetworkParam(newNetworkId);
          }}
        >
          {NETWORKS.map((network) => (
            <DropdownMenuRadioItem key={network.id} value={network.id}>
              {network.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
